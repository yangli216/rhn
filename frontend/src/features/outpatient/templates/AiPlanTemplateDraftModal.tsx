import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/api'
import { planTextStreamPreview, type OutpatientPlanTemplate, type OutpatientPlanTemplateScope,
  type PlanTextDraft, type PlanTextReviewItem, type SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { Alert, Button, Dialog, FormField, Icon, IconButton, LoadingState, StatusBadge, Tabs, Tooltip } from '../../../shared/ui'
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

const reviewGroups: Array<{ key: string; label: string; kinds: PlanTextReviewItem['kind'][] }> = [
  { key: 'diagnosis', label: '诊断与适用条件', kinds: ['DIAGNOSIS', 'CONDITION'] },
  { key: 'medication', label: '用药建议', kinds: ['MEDICATION'] },
  { key: 'service', label: '检验检查', kinds: ['LABORATORY', 'EXAMINATION'] },
  { key: 'follow-up', label: '宣教与随访', kinds: ['EDUCATION', 'FOLLOW_UP'] },
]

const hasIcd10Code = (text: string) => /\[[A-Z]\d{2}(?:\.\d+)?\]/.test(text)
const catalogTaskKinds = new Set(['DIAGNOSIS', 'MEDICATION', 'LABORATORY', 'EXAMINATION'])

function PlanReviewChecklist({ items, isStreaming, onRemove }: {
  items: PlanTextReviewItem[]
  isStreaming?: boolean
  onRemove?: (index: number) => void
}) {
  const available = items ?? []
  return <div className={`ai-plan-review-list ${isStreaming ? 'ai-plan-review-list--streaming' : ''}`} role="region" aria-label="临床方案审核清单">
    {reviewGroups.map((group) => {
      const values = available.map((item, index) => ({ item, index }))
        .filter(({ item }) => group.kinds.includes(item.kind))
      if (!values.length) return null
      return <section key={group.key} className="ai-plan-review-group">
        <header><strong>{group.label}</strong><span>{values.length} 项</span></header>
        <div className="ai-plan-review-items">
          {values.map(({ item, index }) => <article key={`${item.kind}-${item.text}-${index}`} className="ai-plan-review-item">
            <div className="ai-plan-review-item__main">
              <div className="ai-plan-review-item__title-row">
                <strong>{item.text}</strong>
                {item.kind === 'DIAGNOSIS' && hasIcd10Code(item.text) && (
                  <span className="ai-plan-kind-badge ai-plan-kind-badge--diagnosis">ICD-10 标准诊断</span>
                )}
                {item.kind === 'CONDITION' && (
                  <span className="ai-plan-kind-badge ai-plan-kind-badge--condition">适用人群 / 证候</span>
                )}
              </div>
              {item.details && <small>{item.details}</small>}
            </div>
            {onRemove && <IconButton
              icon="close"
              label={`移除 ${item.text}`}
              className="ai-plan-review-item__remove"
              onClick={() => onRemove(index)}
            />}
          </article>)}
        </div>
      </section>
    })}
    {!available.length && !isStreaming && (
      <div className="ai-plan-modal-row-empty">当前没有保留的诊疗项目，请通过左侧对话补充需要的内容。</div>
    )}
  </div>
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
  const [reviewMode, setReviewMode] = useState<'TASKS' | 'RAW'>('TASKS')
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
          content: `您正在调整诊疗方案「${editingTemplate.name}」。右侧已载入当前明细，可在此对话协同微调。`,
        },
      ]
    }
    return [
      {
        id: safeRandomUUID(),
        role: 'assistant',
        content: '输入门诊临床意图、开方速记或指南条文，AI 为您梳理生成方案草案并支持对话微调。',
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
        setReviewMode('TASKS')
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
      setCompiledDraft(result)
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
            <span>AI 辅助草稿 · 保存前请核对临床内容</span>
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
                <h3>{compiling ? streamPreview.name || (revisionRunning ? '正在修订门诊方案' : '正在生成门诊方案') : stage === 'TEXT_REVIEW'
                  ? textDraft?.name || '临床方案审核' : isEditing ? '方案调整与明细微调' : '系统方案核对'}</h3>
              </div>
              {stage === 'TEXT_REVIEW' && textDraft ? (
                <div className="ai-plan-modal-mode-switch">
                  <StatusBadge tone="warning">文字草案待审阅</StatusBadge>
                  <Tabs value={reviewMode} label="方案审阅方式" variant="line" items={[
                    { value: 'TASKS', label: '临床清单' },
                    { value: 'RAW', label: '全文修订' },
                  ]} onChange={(value) => setReviewMode(value as 'TASKS' | 'RAW')} />
                </div>
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
                      <span>AI 正在继续流式梳理后续临床建议与处置...</span>
                    </div>
                  </div>
                ) : (
                  <div className="ai-plan-stream-skeleton">
                    <div className="ai-plan-stream-skeleton-box">
                      <div className="ai-plan-stream-skeleton-head">
                        <span className="ai-plan-stream-spin" /> 正在对齐 ICD-10 临床诊断与适用条件...
                      </div>
                      <div className="ai-plan-stream-skeleton-line" style={{ width: '85%' }} />
                      <div className="ai-plan-stream-skeleton-line" style={{ width: '60%' }} />
                    </div>
                  </div>
                )}

                {/* 实时文书草案折叠预览 */}
                {streamPreview.narrative && (
                  <details className="ai-plan-stream-narrative-collapse">
                    <summary>查看实时文字草案流（{streamPreview.narrative.length} 字）</summary>
                    <div className="ai-plan-stream-narrative-box">
                      {streamPreview.narrative}
                      <span className="ai-plan-stream-caret" aria-hidden="true" />
                    </div>
                  </details>
                )}
              </div>
            ) : converting ? (
              <LoadingState label="正在匹配院内诊断、药品和检验检查目录..." />
            ) : stage === 'TEXT_REVIEW' && textDraft ? (
              <div className="ai-plan-modal-text-review">
                {reviewMode === 'TASKS' ? (
                  <PlanReviewChecklist
                    items={textDraft.reviewItems}
                    onRemove={(index) => setTextDraft({
                      ...textDraft,
                      reviewItems: textDraft.reviewItems.filter((_, itemIndex) => itemIndex !== index),
                    })}
                  />
                ) : (
                  <textarea
                    className="ui-field__control ai-plan-modal-narrative-editor"
                    value={textDraft.narrative}
                    onChange={(e) => setTextDraft({ ...textDraft, narrative: e.target.value })}
                    aria-label="AI 文字方案草案原文"
                    placeholder="输入或修订门诊文字方案内容..."
                  />
                )}
              </div>
            ) : !compiledDraft ? (
              <div className="ai-plan-empty-view">
                <div className="ui-empty-state__icon">
                  <Icon name="tasks" />
                </div>
                <h3 className="ai-plan-empty-title">系统方案核对</h3>
                <p className="ai-plan-empty-subtitle">编译结果将在此逐项呈现</p>
                <p className="ai-plan-empty-desc">
                  从左侧输入临床意图、开方速记或指南条文，模型将自动提取任务、尝试对齐院内目录，并保留需医生判断的内容。
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
                    仍有 {unresolvedCatalogTasks.length} 项诊断、药品或检验检查未能唯一匹配当前机构目录。
                    请移除不需要的候选项，或返回对话继续明确后再保存。
                  </Alert>
                )}
                {missingStandardDiagnosis && (
                  <Alert tone="warning">当前方案尚无已匹配的 ICD-10 标准诊断，请通过对话补充或调整后再保存。</Alert>
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
                    初步诊断 ({compiledDraft.diagnoses.length})
                  </div>
                  {compiledDraft.diagnoses.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">请至少指定一个诊断</div>
                  ) : (
                    compiledDraft.diagnoses.map((d, idx) => (
                      <div key={idx} className="ai-plan-modal-row">
                        <span><strong>{d.display}</strong> ({d.code})</span>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="neutral">{d.type === 'PRIMARY' ? '主诊断' : '次诊断'}</StatusBadge>
                          <Button size="sm" variant="text" aria-label={`移除诊断 ${d.display}`} title="移除"
                            onClick={() => removeDiagnosis(idx)}><Icon name="close" /></Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 处方药品列表 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    推荐处方用药 ({compiledDraft.medications.length})
                  </div>
                  {compiledDraft.medications.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂无唯一匹配当前科室库存的药品</div>
                  ) : (
                    compiledDraft.medications.map((m, idx) => (
                      <div key={idx} className="ai-plan-modal-row ai-plan-modal-row-bordered">
                        <div>
                          <div><strong>{m.medicationName || `在库药品 #${m.medicationId}`}</strong> {m.preparationSpec && <small className="ai-plan-modal-subtext">({m.preparationSpec})</small>}</div>
                          <small className="ai-plan-modal-row-sub">用法: {[
                            m.routeCode,
                            m.frequencyCode,
                            m.doseValue && m.doseUnit ? `每次 ${m.doseValue}${m.doseUnit}` : null,
                            m.durationValue && m.durationUnit ? `${m.durationValue}${m.durationUnit}` : '疗程待开立时确认',
                          ].filter(Boolean).join(' · ')}</small>
                        </div>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="success">在库已对齐</StatusBadge>
                          <Button size="sm" variant="text" aria-label={`移除药品 ${m.medicationName || m.medicationId}`}
                            title="移除" onClick={() => removeMedication(idx)}><Icon name="close" /></Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 检验检查服务 */}
                <div className="ai-plan-modal-section">
                  <div className="ai-plan-modal-section-title">
                    检验与检查项目 ({compiledDraft.services.length})
                  </div>
                  {compiledDraft.services.length === 0 ? (
                    <div className="ai-plan-modal-row-empty">暂无检验检查项目</div>
                  ) : (
                    compiledDraft.services.map((s, idx) => (
                      <div key={idx} className="ai-plan-modal-row">
                        <div>
                          <strong>{s.itemName || `服务项目 #${s.catalogItemId}`}</strong>
                          {s.itemCode && <small className="ai-plan-modal-item-code">({s.itemCode})</small>}
                        </div>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone="neutral">
                            {s.serviceType === 'LABORATORY' ? '检验' : s.serviceType === 'EXAMINATION' ? '检查' : '诊疗'}
                          </StatusBadge>
                          <span className="ai-plan-modal-row-sub">{s.quantity} {s.unitCode}</span>
                          <Button size="sm" variant="text" aria-label={`移除项目 ${s.itemName || s.catalogItemId}`}
                            title="移除" onClick={() => removeService(idx)}><Icon name="close" /></Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 临床任务与宣教随访（非空时呈现） */}
                {compiledDraft.tasks && compiledDraft.tasks.length > 0 && (
                  <div className="ai-plan-modal-section">
                    <div className="ai-plan-modal-section-title">
                      临床任务与宣教随访 ({compiledDraft.tasks.length})
                    </div>
                    {compiledDraft.tasks.map((task, idx) => (
                      <div key={`${task.kind}-${idx}`} className="ai-plan-modal-row ai-plan-modal-row-bordered">
                        <div>
                          <strong>{planTaskKindLabel[task.kind]} · {task.text}</strong>
                          {task.details && <small className="ai-plan-modal-row-sub">{task.details}</small>}
                          <details className="ai-plan-review-evidence"><summary>依据</summary>
                            <p>{task.sourceQuote ? `原文：“${task.sourceQuote}”` : '输入中未明确提出，属于模型补充建议。'}</p>
                          </details>
                        </div>
                        <div className="ai-plan-modal-actions">
                          <StatusBadge tone={task.status === 'MATCHED' ? 'success' : task.status === 'UNMATCHED' ? 'danger' : 'warning'}>
                            {task.status === 'MATCHED' ? '目录已匹配' : task.status === 'UNMATCHED' ? '未匹配' : '待医生核对'}
                          </StatusBadge>
                          <Button size="sm" variant="text" disabled={task.status === 'MATCHED'}
                            aria-label={`移除任务 ${task.text}`} title="移除" onClick={() => removeTask(idx)}><Icon name="close" /></Button>
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
