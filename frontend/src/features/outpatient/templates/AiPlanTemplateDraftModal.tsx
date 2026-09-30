import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import '../../../styles/features/outpatient-doctor.css'
import type { RhnApi } from '../../../shared/api'
import { planTextStreamPreview, type OutpatientPlanTemplate, type OutpatientPlanTemplateScope,
  type OutpatientPlanTask, type PlanTextDraft, type PlanTextReviewItem, type SaveOutpatientPlanTemplateInput,
  type CompiledPlanMedicationItem, type CompiledPlanServiceItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import { Alert, Button, Dialog, FormField, Icon, StatusBadge, Tooltip, type IconName } from '../../../shared/ui'
import { errorMessage } from '../../../shared/api/httpClient'
import { safeRandomUUID } from '../../../shared/utils/uuid'
import { planTaskKindLabel } from './planTaskPresentation'

interface AiPlanTemplateDraftModalProps {
  api: RhnApi
  initialScope?: OutpatientPlanTemplateScope
  editingTemplate?: OutpatientPlanTemplate | null
  onClose: () => void
  onSaved: (template: OutpatientPlanTemplate) => void
}

const reviewGroups: Array<{ key: string; label: string; icon: IconName; kinds: PlanTextReviewItem['kind'][] }> = [
  { key: 'diagnosis', label: '诊断与评估', icon: 'stethoscope', kinds: ['DIAGNOSIS', 'CONDITION'] },
  { key: 'medication', label: '用药建议', icon: 'pill', kinds: ['MEDICATION'] },
  { key: 'service', label: '检验检查', icon: 'flask', kinds: ['LABORATORY', 'EXAMINATION'] },
  { key: 'follow-up', label: '宣教与随访', icon: 'tasks', kinds: ['EDUCATION', 'FOLLOW_UP'] },
]

const hasIcd10Code = (text: string) => /\[[A-Z]\d{2}(?:\.\d+)?\]/.test(text)
const catalogTaskKinds = new Set(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION'])

function parseMedicationUsageHint(text?: string, details?: string): string | null {
  const source = `${text || ''} ${details || ''}`
  const matchExplicit = /常规用法[：:]\s*([^\n；;，,。]+)/.exec(source)
  if (matchExplicit) {
    return matchExplicit[1].trim()
  }
  const parts: string[] = []
  const doseMatch = /([0-9]+(?:\.[0-9]+)?\s*(?:g|mg|ug|μg|ml|mL|片|粒|支|包|袋))/i.exec(source)
  if (doseMatch) parts.push(doseMatch[1])
  const routeMatch = /(口服|外用|静脉滴注|肌肉注射|皮下注射|雾化吸入)/.exec(source)
  if (routeMatch) parts.push(routeMatch[1])
  const freqMatch = /(?:每日|一日)(?:一|两|三|四)次|qd|bid|tid|qid|prn|qn/i.exec(source)
  if (freqMatch) parts.push(freqMatch[0])
  const durMatch = /([0-9]+\s*天|[0-9]+\s*日|连用[0-9]+天)/.exec(source)
  if (durMatch) parts.push(durMatch[0])
  return parts.length >= 2 ? parts.join(' · ') : null
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
                const usageHint = item.kind === 'MEDICATION' ? parseMedicationUsageHint(item.text, item.details) : null
                return (
                  <article
                    key={`${item.kind}-${item.text}-${index}`}
                    className={`ai-plan-review-item ${isTextItem ? 'ai-plan-review-item--text' : ''}`}
                  >
                    <div className="ai-plan-review-item__main">
                      <div className="ai-plan-review-item__title-row">
                        <strong className="ai-plan-review-item__name">{item.text}</strong>
                        {usageHint && <StatusBadge tone="neutral">{usageHint}</StatusBadge>}
                        {item.kind === 'DIAGNOSIS' && hasIcd10Code(item.text) && (
                          <StatusBadge tone="info">ICD-10 标准诊断</StatusBadge>
                        )}
                        {item.kind === 'CONDITION' && (
                          <StatusBadge tone="warning">待对齐诊断</StatusBadge>
                        )}
                        {item.details && !isTextItem && (
                          <Tooltip content={<div className="ai-plan-tooltip-details">{item.details}</div>}>
                            <button type="button" className="ai-plan-info-btn" aria-label={`查看 ${item.text} 依据`}>
                              <Icon name="info" />
                            </button>
                          </Tooltip>
                        )}
                        {isMatching && catalogTaskKinds.has(item.kind) && <StatusBadge tone="warning">匹配中</StatusBadge>}
                        {isMatching && !catalogTaskKinds.has(item.kind) && item.kind !== 'CONDITION' && (
                          <StatusBadge tone="warning">待医生确认</StatusBadge>
                        )}
                      </div>
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

function mergeOriginalRecords(
  reviewItems: PlanTextReviewItem[],
  result: SaveOutpatientPlanTemplateInput,
) {
  const existing = result.tasks ?? []
  const matchStatus = (item: PlanTextReviewItem): OutpatientPlanTask['status'] => {
    if (item.kind === 'DIAGNOSIS' && result.diagnoses.some((diagnosis) =>
      item.text.includes(diagnosis.display) || item.text.includes(diagnosis.code))) return 'MATCHED'
    if (item.kind === 'MEDICATION' && result.medications.some((medication) =>
      medication.medicationName && item.text.includes(medication.medicationName))) return 'MATCHED'
    if ((item.kind === 'LABORATORY' || item.kind === 'EXAMINATION') && result.services.some((service) =>
      service.itemName && item.text.includes(service.itemName))) return 'MATCHED'
    return item.kind === 'CONDITION' || item.kind === 'EDUCATION' || item.kind === 'FOLLOW_UP'
      ? 'NEEDS_REVIEW' : 'UNMATCHED'
  }
  const records = reviewItems.map((item) => {
    const matched = existing.find((task) => task.kind === item.kind && task.text === item.text)
    return matched ? { ...matched, details: item.details ?? matched.details } : { ...item, status: matchStatus(item) }
  })
  const known = new Set(records.map((task) => `${task.kind}:${task.text}`))
  return [...records, ...existing.filter((task) => !known.has(`${task.kind}:${task.text}`))]
}


interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  round?: number
  webSearch?: boolean
}

const quickStartChips = ['成人风寒感冒', '急性上感对症', '慢支止咳化痰', '高血压门诊初诊', '社区获得性肺炎轻症', '急性扁桃体炎', '小儿积食咳嗽']
const quickRevisionChips = ['删除检验检查', '诊断对齐ICD-10', '补充3天后复诊', '精简口服用药', '增加血常规检查']

export function AiPlanTemplateDraftModal({
  api,
  initialScope = 'PERSONAL',
  editingTemplate,
  onClose,
  onSaved,
}: AiPlanTemplateDraftModalProps) {
  const isEditing = !!editingTemplate
  const [naturalInput, setNaturalInput] = useState('')
  const [scope, setScope] = useState<OutpatientPlanTemplateScope>(editingTemplate?.scopeType || initialScope)
  const [textDraft, setTextDraft] = useState<PlanTextDraft | null>(null)
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
      diagnoses: [...editingTemplate.diagnoses],
      medications: editingTemplate.medications.map((m) => ({
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
      services: editingTemplate.services.map((s) => ({
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
  const [converting, setConverting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streamSource, setStreamSource] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [initialIntent, setInitialIntent] = useState('')
  const [revisionCount, setRevisionCount] = useState(0)
  const [revisionRunning, setRevisionRunning] = useState(false)
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
  const unresolvedCatalogTasks = useMemo(() => (compiledDraft?.tasks ?? []).filter((task) =>
    (catalogTaskKinds.has(task.kind) && task.status !== 'MATCHED')
      || (task.kind === 'CONDITION' && task.details?.includes('尚未匹配院内 ICD-10 术语'))), [compiledDraft?.tasks])
  const missingStandardDiagnosis = !isEditing && !!compiledDraft && compiledDraft.diagnoses.length === 0

  const [activeMedSearchTaskIndex, setActiveMedSearchTaskIndex] = useState<number | null>(null)
  const [medSearchKeyword, setMedSearchKeyword] = useState('')
  const [medSearchResults, setMedSearchResults] = useState<any[]>([])

  const [activeServiceSearchTaskIndex, setActiveServiceSearchTaskIndex] = useState<number | null>(null)
  const [serviceSearchKeyword, setServiceSearchKeyword] = useState('')
  const [serviceSearchResults, setServiceSearchResults] = useState<any[]>([])

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

  const otherTasks = useMemo(() => {
    return tasksWithIndex.filter(({ task }) =>
      !catalogTaskKinds.has(task.kind) && task.kind !== 'CONDITION'
    )
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
  const modelReady = capabilities.data?.mode === 'MODEL' && capabilities.data.available
    && capabilities.data.features.includes('PLAN_COMPILATION')

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
          (delta) => setStreamSource((current) => current + delta),
        )
        setTextDraft(result)
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
        setError(errorMessage(e) || 'AI 编译方案失败，请重试')
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
          (delta) => setStreamSource((current) => current + delta),
        )
        setTextDraft(result)
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
        setError(errorMessage(e) || 'AI 修订方案失败，请重试')
      } finally {
        if (compileAbortRef.current === controller) {
          compileAbortRef.current = null
          setCompiling(false)
          setRevisionRunning(false)
        }
      }
    }
  }

  const handleConvert = async () => {
    if (!textDraft) return
    setError(null)
    setConverting(true)
    try {
      const sourceText = initialIntent || naturalInput.trim()
      const result = await api.outpatientPlanTemplates.convertDraft(
        sourceText,
        textDraft.narrative.trim(),
        textDraft.name,
        textDraft.reviewItems,
        scope,
      )
      // 目录匹配只补充原记录的状态，不用一批新记录替换医生刚刚确认的内容。
      setCompiledDraft({
        ...result,
        tasks: mergeOriginalRecords(textDraft.reviewItems, result),
      })
      setStage('STRUCTURED_REVIEW')
    } catch (e: any) {
      setError(errorMessage(e) || '转换系统方案失败，请检查文字方案后重试')
    } finally {
      setConverting(false)
    }
  }

  const handleSave = async () => {
    if (!compiledDraft) return
    setError(null)
    setSaving(true)
    try {
      if (isEditing && editingTemplate) {
        const updated = await api.outpatientPlanTemplates.update(editingTemplate.id, {
          expectedRevision: editingTemplate.revision,
          scopeType: scope,
          name: compiledDraft.name,
          description: compiledDraft.description,
          guidelineReference: compiledDraft.guidelineReference,
          sortOrder: compiledDraft.sortOrder,
          diagnoses: compiledDraft.diagnoses,
          medications: compiledDraft.medications,
          services: compiledDraft.services,
          tasks: compiledDraft.tasks,
        })
        onSaved(updated)
      } else {
        const saved = await api.outpatientPlanTemplates.create({
          ...compiledDraft,
          scopeType: scope,
        })
        onSaved(saved)
      }
    } catch (e: any) {
      setError(errorMessage(e) || (isEditing ? '调整方案失败，请重试' : '保存方案失败，请检查名称或目录完整性'))
    } finally {
      setSaving(false)
    }
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
    setCompiledDraft({ ...compiledDraft, medications: next })
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

  const handleSearchMed = async (keyword: string) => {
    if (!keyword.trim()) return
    try {
      let items: any[] = []
      if (api.masterData?.searchMedicationProducts) {
        const res = await api.masterData.searchMedicationProducts(keyword.trim(), '', 'ACTIVE', '', 0, 8)
        if (res?.content?.length) {
          items = res.content.map((entry: any) => {
            const prod = entry.product || entry
            const med = entry.medication
            return {
              id: prod.id,
              medicationId: med?.id || prod.medicationId,
              name: prod.name || med?.name,
              tradeName: prod.tradeName,
              preparationSpec: prod.preparationSpec || med?.preparationSpec,
              packages: prod.packages,
              doseUnit: med?.defaultDoseUnit || prod.doseUnit,
              defaultDose: med?.defaultDose,
              defaultRoute: med?.defaultRoute,
              defaultFrequency: med?.defaultFrequency,
              packageUnit: prod.packages?.[0]?.unitName || prod.packageUnit,
              isGenericOnly: false,
            }
          })
        }
      }
      if (api.masterData?.searchMedications) {
        const medRes = await api.masterData.searchMedications(keyword.trim(), '', 'ACTIVE', '', 0, 8)
        if (medRes?.content?.length) {
          const genericItems = medRes.content
            .filter((m: any) => !items.some((existing) => String(existing.medicationId) === String(m.id)))
            .map((m: any) => ({
              id: m.id,
              medicationId: m.id,
              name: m.name,
              tradeName: m.aliasName,
              preparationSpec: m.preparationSpec,
              doseUnit: m.defaultDoseUnit,
              defaultDose: m.defaultDose,
              defaultRoute: m.defaultRoute,
              defaultFrequency: m.defaultFrequency,
              preparationUnit: m.preparationUnit,
              isGenericOnly: true,
            }))
          items = [...items, ...genericItems]
        }
      }
      setMedSearchResults(items)
    } catch {
      setMedSearchResults([])
    }
  }

  const handleSelectMedProduct = (taskIndex: number, prod: any) => {
    if (!compiledDraft) return
    const isGeneric = Boolean(prod.isGenericOnly)
    const newMedication: CompiledPlanMedicationItem = {
      medicationId: String(prod.medicationId || prod.id),
      catalogItemId: isGeneric ? undefined : String(prod.id),
      packageId: isGeneric ? undefined : String(prod.packages?.[0]?.id || prod.packageId || prod.id),
      medicationName: prod.name,
      preparationSpec: prod.preparationSpec,
      doseValue: prod.defaultDose || 1,
      doseUnit: prod.doseUnit || prod.defaultDoseUnit || '片',
      routeCode: prod.defaultRoute || 'ORAL',
      frequencyCode: prod.defaultFrequency || 'TID',
      quantity: 1,
      quantityUnit: prod.packageUnit || prod.preparationUnit || '盒',
      substitutionAllowed: true,
      selfProvided: false,
    }
    const nextMedications = [...compiledDraft.medications, newMedication]
    const nextTasks = (compiledDraft.tasks ?? []).map((t, i) =>
      i === taskIndex ? { ...t, status: 'MATCHED' as const } : t
    )
    setCompiledDraft({
      ...compiledDraft,
      medications: nextMedications,
      tasks: nextTasks,
    })
    setActiveMedSearchTaskIndex(null)
    setMedSearchResults([])
  }

  const handleSearchService = async (keyword: string) => {
    if (!keyword.trim() || !api.masterData?.searchServices) return
    try {
      const res = await api.masterData.searchServices(keyword.trim(), '', 'ACTIVE', '', 0, 8)
      setServiceSearchResults(res.content || [])
    } catch {
      setServiceSearchResults([])
    }
  }

  const handleSelectServiceItem = (taskIndex: number, srv: any) => {
    if (!compiledDraft) return
    const newService: CompiledPlanServiceItem = {
      catalogItemId: String(srv.id),
      itemCode: srv.code,
      itemName: srv.name,
      serviceType: srv.serviceType || 'LABORATORY',
      quantity: 1,
      unitCode: srv.unitCode || '次',
      priceType: 'SALE',
      pricingRequired: true,
    }
    const nextServices = [...compiledDraft.services, newService]
    const nextTasks = (compiledDraft.tasks ?? []).map((t, i) =>
      i === taskIndex ? { ...t, status: 'MATCHED' as const } : t
    )
    setCompiledDraft({
      ...compiledDraft,
      services: nextServices,
      tasks: nextTasks,
    })
    setActiveServiceSearchTaskIndex(null)
    setServiceSearchResults([])
  }

  return (
    <Dialog
      title={isEditing ? `调整诊疗方案 “${editingTemplate?.name}”` : 'AI 诊疗方案助手'}
      eyebrow={isEditing ? '方案调整与明细微调' : '智能方案构建'}
      size="xwide"
      className="ai-plan-dialog"
      onClose={() => {
        if (saving) return
        compileAbortRef.current?.abort()
        onClose()
      }}
      footer={
        <>
          <div className="ai-plan-footer-tip">
            <Icon name="info" />
            <span>AI 草稿 · 保存前请核对</span>
          </div>
          <Button variant="secondary" disabled={saving} onClick={() => {
            compileAbortRef.current?.abort()
            onClose()
          }}>
            取消
          </Button>
          {stage === 'TEXT_REVIEW' && textDraft ? <Button busy={converting}
            disabled={converting || !textDraft.narrative.trim() || textDraft.reviewItems.length === 0} onClick={handleConvert}>
            确认方案并匹配院内目录
          </Button> : compiledDraft ? <Button
              busy={saving}
              disabled={saving || compiling || !compiledDraft.name.trim()
                || missingStandardDiagnosis
                || unresolvedCatalogTasks.length > 0
                || !(compiledDraft.diagnoses.length || compiledDraft.medications.length
                  || compiledDraft.services.length || compiledDraft.tasks?.length)}
              onClick={handleSave}
            >
              {isEditing ? '确认保存调整' : '确认存入方案池'}
            </Button> : null}
        </>
      }
    >
      <div className="ai-plan-modal-body">
        {error && <Alert>{error}</Alert>}

        <div className="ai-plan-modal-grid">
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
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={scope === opt.value}
                      className={`ai-plan-scope-pill ${scope === opt.value ? 'is-active' : ''}`}
                      title={opt.title}
                      onClick={() => setScope(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {modelReady && (
                <span className="ai-plan-model-badge" title={capabilities.data?.model || '已连接模型'}>
                  <span className="ai-plan-model-dot" />
                  <span>{capabilities.data?.model || '模型就绪'}</span>
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
                  className={`ai-plan-chat-msg ai-plan-chat-msg--${msg.role}`}
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
                  <button
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
                  </button>
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
                    <button
                      type="button"
                      className={`ai-plan-chat-chip ai-plan-chat-chip--more ${chipsMoreOpen ? 'is-active' : ''}`}
                      onClick={() => setChipsMoreOpen((prev) => !prev)}
                      aria-haspopup="true"
                      aria-expanded={chipsMoreOpen}
                    >
                      更多 ▾
                    </button>
                    {chipsMoreOpen && (
                      <div className="ai-plan-chips-popover" role="menu">
                        <div className="ai-plan-chips-popover-title">更多临床推荐</div>
                        <div className="ai-plan-chips-popover-list">
                          {(textDraft ? quickRevisionChips : quickStartChips).slice(2).map((chip) => (
                            <button
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
                            </button>
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
                      <button
                        type="button"
                        className={`ai-plan-tool-btn ${isListening ? 'is-active is-listening' : ''}`}
                        onClick={toggleSpeech}
                        aria-label="语音输入"
                      >
                        <Icon name="mic" />
                      </button>
                    </Tooltip>

                    <Tooltip content={webSearchEnabled ? '联网检索：已开启（将检索最新临床指南与循证文献）' : '联网检索：已关闭（点击开启）'}>
                      <button
                        type="button"
                        className={`ai-plan-tool-btn ${webSearchEnabled ? 'is-active' : ''}`}
                        onClick={() => setWebSearchEnabled((prev) => !prev)}
                        aria-label="联网检索"
                      >
                        <Icon name="globe" />
                      </button>
                    </Tooltip>
                  </div>

                  <button
                    type="button"
                    disabled={compiling || !modelReady || (!chatInput.trim() && !isListening)}
                    className="ai-plan-send-btn"
                    onClick={() => void handleSend()}
                    aria-label="发送"
                  >
                    <Icon name="send" />
                    <span>{compiling ? '生成中...' : '发送'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="ai-plan-modal-right">
            <div className="ai-plan-modal-right-head">
              <div>
                <h3>{compiling ? streamPreview.name || (revisionRunning ? '正在修订门诊方案' : '正在生成门诊方案') : converting ? '正在匹配院内目录' : stage === 'TEXT_REVIEW'
                  ? textDraft?.name || '临床方案审核' : isEditing ? '方案调整与明细微调' : '系统方案核对'}</h3>
              </div>
              {converting ? (
                <StatusBadge tone="warning">逐条匹配中</StatusBadge>
              ) : stage === 'TEXT_REVIEW' && textDraft ? (
                <StatusBadge tone="warning">方案待审阅</StatusBadge>
              ) : compiledDraft ? (
                <StatusBadge tone="success">
                  {isEditing ? '待核对后保存' : compiledDraft.sourceType === 'AI_GUIDELINE' ? '条文提取完成 · 来源未核验' : '目录匹配完成 · 待确认'}
                </StatusBadge>
              ) : null}
            </div>

            {compiling ? (
              <div className="ai-plan-stream-view" aria-live="polite" aria-busy="true">
                <div className="ai-plan-stream-view__status-card">
                  <div className="ai-plan-stream-view__status-title">
                    <span className="ai-plan-stream-pulse-dot" />
                    <strong>{streamPreview.name || (revisionRunning ? '正在按修订要求更新方案...' : '正在实时构建临床方案...')}</strong>
                  </div>
                  <span className="ai-plan-stream-view__badge">
                    {streamPreview.items.length > 0
                      ? `已结构化梳理 ${streamPreview.items.length} 项`
                      : (revisionRunning ? '模型分析修订要求中...' : '模型正在分析临床意图...')}
                  </span>
                </div>

                {/* 渐进式呈现：诊断先输出则先显示诊断，用药输出则接着显示用药 */}
                {streamPreview.items.length > 0 ? (
                  <div className="ai-plan-stream-content">
                    <PlanReviewChecklist items={streamPreview.items} isStreaming />
                    <div className="ai-plan-stream-live-indicator">
                      <span className="ai-plan-stream-spin" />
                      <span>{streamPreview.narrative ? `临床条目已梳理完毕（${streamPreview.items.length} 项），正在生成方案全文...` : 'AI 正在梳理临床建议与处置条目...'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="ai-plan-stream-skeleton">
                    <div className="ai-plan-stream-skeleton-box">
                    <div className="ai-plan-stream-skeleton-head">
                        <span className="ai-plan-stream-spin" /> 正在对齐 ICD-10 诊断...
                      </div>
                      <div className="ai-plan-stream-skeleton-line" style={{ width: '85%' }} />
                      <div className="ai-plan-stream-skeleton-line" style={{ width: '60%' }} />
                    </div>
                  </div>
                )}

                {/* 实时文书草案折叠预览 */}
                {streamPreview.narrative && (
                  <details className="ai-plan-stream-narrative-collapse">
                    <summary>实时方案草案流（已生成 {streamPreview.narrative.length} 字）</summary>
                    <div className="ai-plan-stream-narrative-box">
                      {streamPreview.narrative}
                      <span className="ai-plan-stream-caret" aria-hidden="true" />
                    </div>
                  </details>
                )}
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
                <PlanReviewChecklist items={textDraft.reviewItems} isMatching />
              </div>
            ) : stage === 'TEXT_REVIEW' && textDraft ? (
              <div className="ai-plan-modal-text-review">
                <PlanReviewChecklist
                  items={textDraft.reviewItems}
                  onRemove={(index) => setTextDraft({
                    ...textDraft,
                    reviewItems: textDraft.reviewItems.filter((_, itemIndex) => itemIndex !== index),
                  })}
                  onUpdateItem={(index, updated) => setTextDraft({
                    ...textDraft,
                    reviewItems: textDraft.reviewItems.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, ...updated } : item,
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

                {/* 诊断列表 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    诊断 ({compiledDraft.diagnoses.length + unmatchedDiagnosisTasks.length})
                  </div>
                  {compiledDraft.diagnoses.length === 0 && unmatchedDiagnosisTasks.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">请至少指定一个诊断</div>
                  ) : (
                    <>
                      {compiledDraft.diagnoses.map((d, idx) => (
                        <div key={`diag-${idx}`} className="ai-plan-modal-row ai-plan-match-result-row">
                          <span><strong>{d.display}</strong> ({d.code})</span>
                          <div className="ai-plan-modal-actions">
                            <StatusBadge tone="neutral">{d.type === 'PRIMARY' ? '主诊断' : '次诊断'}</StatusBadge>
                            <StatusBadge tone="success">已匹配标准库</StatusBadge>
                            <Button size="sm" variant="text" aria-label={`移除诊断 ${d.display}`} title="移除"
                              onClick={() => removeDiagnosis(idx)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      ))}
                      {unmatchedDiagnosisTasks.map(({ task, index }) => (
                        <div key={`diag-task-${index}`} className="ai-plan-modal-row ai-plan-row-unmatched">
                          <div className="ai-plan-task-content">
                            <div className="ai-plan-task-title-row">
                              <strong>{task.text}</strong>
                              {task.details && (
                                <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                  <button type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                    <Icon name="info" />
                                  </button>
                                </Tooltip>
                              )}
                            </div>
                          </div>
                          <div className="ai-plan-modal-actions">
                            <StatusBadge tone="danger">未匹配标准编码</StatusBadge>
                            <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`} title="移除"
                              onClick={() => removeTask(index)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* 处方药品列表 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    用药 ({compiledDraft.medications.length + unmatchedMedicationTasks.length})
                  </div>
                  {compiledDraft.medications.length === 0 && unmatchedMedicationTasks.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂无推荐用药</div>
                  ) : (
                    <>
                      {compiledDraft.medications.map((m, idx) => (
                        <div key={`med-${idx}`} className="ai-plan-modal-row ai-plan-modal-row-bordered ai-plan-match-result-row">
                          <div>
                            <div>
                              <strong>{m.medicationName || `在库药品 #${m.medicationId}`}</strong>{' '}
                              {m.preparationSpec && <small className="ai-plan-modal-subtext">({m.preparationSpec})</small>}
                            </div>
                            <small className="ai-plan-modal-row-sub">用法: {[
                              m.routeCode,
                              m.frequencyCode,
                              m.doseValue && m.doseUnit ? `每次 ${m.doseValue}${m.doseUnit}` : null,
                              m.durationValue && m.durationUnit ? `${m.durationValue}${m.durationUnit}` : '疗程待开立时确认',
                            ].filter(Boolean).join(' · ')}</small>
                          </div>
                          <div className="ai-plan-modal-actions">
                            <StatusBadge tone="success">{m.catalogItemId ? '在库已对齐' : '主档已对齐'}</StatusBadge>
                            <Button size="sm" variant="text" aria-label={`移除药品 ${m.medicationName || m.medicationId}`}
                              title="移除" onClick={() => removeMedication(idx)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      ))}
                      {unmatchedMedicationTasks.map(({ task, index }) => {
                        const usageHint = parseMedicationUsageHint(task.text, task.details)
                        return (
                          <div key={`med-task-${index}`} className="ai-plan-modal-row ai-plan-modal-row-bordered ai-plan-row-unmatched">
                            <div className="ai-plan-task-content">
                              <div className="ai-plan-task-title-row">
                                <strong>{task.text}</strong>
                                {usageHint && <StatusBadge tone="neutral">{usageHint}</StatusBadge>}
                                {task.details && (
                                  <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                    <button type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                      <Icon name="info" />
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                              {activeMedSearchTaskIndex === index ? (
                                <div className="ai-plan-inline-search">
                                  <div className="ai-plan-inline-search__bar">
                                    <input
                                      type="text"
                                      className="ui-field__control"
                                      value={medSearchKeyword}
                                      onChange={(e) => setMedSearchKeyword(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') void handleSearchMed(medSearchKeyword) }}
                                      placeholder="输入药品名称搜索在库产品或通用主档..."
                                      autoFocus
                                    />
                                    <Button size="sm" variant="secondary" onClick={() => void handleSearchMed(medSearchKeyword)}>搜索</Button>
                                    <Button size="sm" variant="text" onClick={() => setActiveMedSearchTaskIndex(null)}>取消</Button>
                                  </div>
                                  {medSearchResults.length > 0 && (
                                    <div className="ai-plan-inline-search__list">
                                      {medSearchResults.map((prod: any) => (
                                        <div key={prod.id} className="ai-plan-inline-search__item" onClick={() => handleSelectMedProduct(index, prod)}>
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
                                  void handleSearchMed(task.text)
                                }}>
                                <Icon name="search" /> 对齐在库药品
                              </Button>
                            )}
                            <StatusBadge tone="danger">未在库 / 待对齐</StatusBadge>
                            <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`}
                              title="移除" onClick={() => removeTask(index)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      )})}
                    </>
                  )}
                </div>

                {/* 检验检查服务 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    检查 / 检验 ({compiledDraft.services.length + unmatchedServiceTasks.length})
                  </div>
                  {compiledDraft.services.length === 0 && unmatchedServiceTasks.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂无检验检查项目</div>
                  ) : (
                    <>
                      {compiledDraft.services.map((s, idx) => (
                        <div key={`srv-${idx}`} className="ai-plan-modal-row ai-plan-match-result-row">
                          <div>
                            <strong>{s.itemName || `服务项目 #${s.catalogItemId}`}</strong>
                            {s.itemCode && <small className="ai-plan-modal-item-code">({s.itemCode})</small>}
                          </div>
                          <div className="ai-plan-modal-actions">
                            <StatusBadge tone="neutral">
                              {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '诊疗'}
                            </StatusBadge>
                            <StatusBadge tone="success">已对齐目录</StatusBadge>
                            <span className="ai-plan-modal-row-sub">{s.quantity} {s.unitCode}</span>
                            <Button size="sm" variant="text" aria-label={`移除项目 ${s.itemName || s.catalogItemId}`}
                              title="移除" onClick={() => removeService(idx)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      ))}
                      {unmatchedServiceTasks.map(({ task, index }) => (
                        <div key={`srv-task-${index}`} className="ai-plan-modal-row ai-plan-row-unmatched">
                          <div className="ai-plan-task-content">
                            <div className="ai-plan-task-title-row">
                              <strong>{task.text}</strong>
                              {task.details && (
                                <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                  <button type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                    <Icon name="info" />
                                  </button>
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
                                {serviceSearchResults.length > 0 && (
                                  <div className="ai-plan-inline-search__list">
                                    {serviceSearchResults.map((srv: any) => (
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
                                void handleSearchService(task.text)
                              }}>
                                <Icon name="search" /> 对齐院内项目
                              </Button>
                            )}
                            <StatusBadge tone="danger">未匹配院内项目</StatusBadge>
                            <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`}
                              title="移除" onClick={() => removeTask(index)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* 临床任务与宣教随访（非空时呈现） */}
                {otherTasks.length > 0 && (
                  <div className="ai-plan-modal-section">
                    <div className="ai-plan-modal-section-title">
                      其他安排 ({otherTasks.length})
                    </div>
                    {otherTasks.map(({ task, index }) => {
                      const isTextTask = task.kind === 'EDUCATION' || task.kind === 'FOLLOW_UP'
                      return (
                        <div key={`other-${task.kind}-${index}`} className={`ai-plan-modal-row ai-plan-modal-row-bordered ${isTextTask ? 'ai-plan-modal-row--text' : ''}`}>
                          <div className="ai-plan-task-content">
                            <div className="ai-plan-task-title-row">
                              <strong>{planTaskKindLabel[task.kind] || '其他'} · {task.text}</strong>
                              {task.details && !isTextTask && (
                                <Tooltip content={<div className="ai-plan-tooltip-details">{task.details}</div>}>
                                  <button type="button" className="ai-plan-info-btn" aria-label={`查看 ${task.text} 依据`}>
                                    <Icon name="info" />
                                  </button>
                                </Tooltip>
                              )}
                            </div>
                            {isTextTask && (
                              <div className="ai-plan-text-item-body">
                                <textarea
                                  className="ui-field__control ai-plan-text-item-input"
                                  rows={2}
                                  value={task.details || ''}
                                  placeholder="输入指导、宣教或随访内容..."
                                  onChange={(e) => {
                                    const nextDetails = e.target.value
                                    setCompiledDraft((prev) => {
                                      if (!prev) return prev
                                      const nextTasks = (prev.tasks ?? []).map((t, i) =>
                                        i === index ? { ...t, details: nextDetails } : t
                                      )
                                      return { ...prev, tasks: nextTasks }
                                    })
                                  }}
                                  aria-label={`${task.text}内容`}
                                />
                              </div>
                            )}
                          </div>
                          <div className="ai-plan-modal-actions">
                            <Tooltip content={isTextTask
                              ? '非目录建议：请决定保留、移除，或直接修改上方指导内容。'
                              : task.status === 'MATCHED' ? '已对应院内目录。' : '请核对目录结果或移除该项。'}>
                              <span className="ai-plan-task-status-tip">
                                <StatusBadge tone={task.status === 'MATCHED' ? 'success' : task.status === 'UNMATCHED' ? 'danger' : 'warning'}>
                                  {task.status === 'MATCHED' ? '目录已匹配' : task.status === 'UNMATCHED' ? '未匹配' : '待医生确认'}
                                </StatusBadge>
                              </span>
                            </Tooltip>
                            <Button size="sm" variant="text" disabled={task.status === 'MATCHED'}
                              aria-label={`移除任务 ${task.text}`} title="移除" onClick={() => removeTask(index)}><Icon name="close" /></Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* 适用条件提示 */}
                {conditionTasks.length > 0 && (
                  <div className="ai-plan-modal-section">
                    <div className="ai-plan-modal-section-title">适用条件提示 ({conditionTasks.length})</div>
                    {conditionTasks.map(({ task, index }) => (
                      <div key={`cond-${index}`} className="ai-plan-modal-row ai-plan-modal-row-bordered">
                        <div className="ai-plan-task-title-row">
                          <Icon name="info" className="ai-plan-row-inline-icon" /> <strong>{task.text}</strong>
                          {task.details && <span className="ai-plan-modal-row-sub">（{task.details}）</span>}
                        </div>
                        <div className="ai-plan-modal-actions">
                          <Button size="sm" variant="text" aria-label={`移除任务 ${task.text}`} title="移除" onClick={() => removeTask(index)}>
                            <Icon name="close" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
