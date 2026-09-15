import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext,
  ClinicalAiSuggestion } from '../../../shared/api/clinicalAiApi'
import { Button, FormField, Icon } from '../../../shared/ui'
import type { ClinicalAiPreview } from '../../../shared/api/clinicalAiStream'
import { recordDraftFields, recordDraftFieldLabels } from './aiDraftAdapter'
import type { ReceptionSceneAssessment } from './receptionSceneAssessment'
import { ClinicalAiPipelineStepper } from './ClinicalAiPipelineStepper'
import type { ClinicalAiSurfaces, InlineAiSelection } from './ClinicalAiInlineWorkspace'

export interface ClinicalAiCopilotHubProps {
  context: ClinicalAiDraftContext
  capability: ClinicalAiCapabilities
  suggestion: ClinicalAiSuggestion | null
  current: boolean
  busy: boolean
  generating: boolean
  inputBusy: boolean
  preview: ClinicalAiPreview
  onView: () => void
  disabled: boolean
  canAdopt: boolean
  error: string
  voiceInput: ReactNode
  interimTranscript?: string
  question: string
  onQuestionChange: (value: string) => void
  onClearVoice?: () => void
  onGenerate: (focus?: string) => Promise<string>
  onApply: (selection: InlineAiSelection) => void
  onOpenDetail?: () => void
  onOpenHistory?: () => void
  onOpenResults?: () => void
  sceneAssessment?: ReceptionSceneAssessment
  sceneLoading?: boolean
  surfaces: ClinicalAiSurfaces
}

export function ClinicalAiCopilotHub({
  context, capability, suggestion, current, busy, generating, inputBusy, preview,
  onView, disabled, canAdopt, error, voiceInput, interimTranscript, question,
  onQuestionChange, onClearVoice, onGenerate, onApply, onOpenDetail, onOpenHistory,
  onOpenResults, sceneAssessment, sceneLoading, surfaces,
}: ClinicalAiCopilotHubProps) {
  const [hubOpen, setHubOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [fields, setFields] = useState<string[]>([])
  const [edited, setEdited] = useState<Record<string, string>>({})
  const appliedSuggestionId = useRef<string | null>(null)
  const hubRef = useRef<HTMLDivElement>(null)
  const composerInputId = useId()

  useEffect(() => {
    setFields([])
    setEdited({})
  }, [suggestion?.id])

  useEffect(() => {
    if (interimTranscript) {
      setHubOpen(true)
    }
  }, [interimTranscript])

  useEffect(() => {
    if (current && (reviewOpen || summaryOpen)) {
      onView()
    }
  }, [current, reviewOpen, summaryOpen, onView])

  const recordFeature = capability.features.includes('RECORD_COMPLETENESS')
  const entries = recordFeature && current ? recordDraftFields.filter((field) => suggestion?.recordDraft[field]?.trim()) : []
  const selectedFields = entries.filter((field) => fields.includes(field)
    && (edited[field] ?? suggestion?.recordDraft[field])?.trim())
  const selectionCount = selectedFields.length
  const adoptionDisabled = disabled || busy || !current || !canAdopt || selectionCount === 0

  const toggle = (values: string[], key: string) => values.includes(key)
    ? values.filter((value) => value !== key) : [...values, key]

  const applySelection = () => onApply({
    recordDraft: selectedFields.length ? Object.fromEntries(selectedFields
      .map((field) => [field, edited[field] ?? suggestion!.recordDraft[field]])) : undefined,
  })

  const generate = (focus?: string) => {
    appliedSuggestionId.current = null
    setReviewOpen(true)
    void onGenerate(focus).catch(() => undefined)
  }

  const generateAndApply = async (presetPrompt?: string) => {
    if (disabled || busy || !canAdopt || !recordFeature || sceneLoading) return
    if (presetPrompt) {
      onQuestionChange(presetPrompt)
    }
    appliedSuggestionId.current = null
    try {
      const id = await onGenerate('RECORD')
      appliedSuggestionId.current = id || null
    } catch {
      appliedSuggestionId.current = null
    }
  }

  useEffect(() => {
    if (!appliedSuggestionId.current || !current || !suggestion || appliedSuggestionId.current !== suggestion.id) return
    appliedSuggestionId.current = null
    const validEntries = recordDraftFields.filter((field) => suggestion.recordDraft[field]?.trim())
    if (validEntries.length === 0) return
    onApply({
      recordDraft: Object.fromEntries(validEntries.map((field) => [field, suggestion.recordDraft[field]])),
    })
  }, [current, onApply, suggestion])

  // Close on Escape key
  useEffect(() => {
    if (!hubOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHubOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [hubOpen])

  // Determine pill scene tag & label
  const isChronic = sceneAssessment?.scene === 'CHRONIC_REFILL'
  const isReport = sceneAssessment?.scene === 'REPORT_FOLLOW_UP'
  const scenePillText = isChronic ? '慢病复诊'
    : isReport ? `报告回诊${sceneAssessment?.selectedReportIds.length ? ` (${sceneAssessment.selectedReportIds.length})` : ''}`
    : ''

  return (
    <div className={`doctor-ai-copilot-hub ${hubOpen ? 'is-expanded' : ''}`} ref={hubRef}>
      {/* Title Bar Compact Pill Entry */}
      <button
        type="button"
        className={`doctor-ai-copilot-pill is-${sceneAssessment?.badgeTone ?? 'brand'} ${generating ? 'is-generating' : ''} ${hubOpen ? 'is-active' : ''}`}
        aria-expanded={hubOpen}
        aria-label="AI 辅诊"
        title="点击展开 AI 辅诊中心、情境识别与场景快捷操作"
        onClick={() => {
          setHubOpen(!hubOpen)
          onView()
        }}
      >
        <span className="doctor-ai-copilot-pill__icon" aria-hidden="true">
          <Icon name="sparkles" />
        </span>
        <strong className="doctor-ai-copilot-pill__title">AI 辅诊</strong>
        {generating ? (
          <span className="doctor-ai-copilot-pill__status">
            <span className="doctor-ai-copilot-pill__pulse" />
            正在共写…
          </span>
        ) : scenePillText ? (
          <span className="doctor-ai-copilot-pill__tag">{scenePillText}</span>
        ) : current ? (
          <span className="doctor-ai-copilot-pill__dot is-ready" title="建议已准备好" />
        ) : null}
        <Icon name={hubOpen ? 'chevron-up' : 'chevron-down'} className="doctor-ai-copilot-pill__caret" />
      </button>

      {/* Floating Command Palette Popover */}
      {hubOpen && (
        <div className="doctor-ai-copilot-popover" role="dialog" aria-label="AI 临床辅诊中枢">
          {/* Popover Header */}
          <header className="doctor-ai-copilot-popover__head">
            <div className="doctor-ai-copilot-popover__title-wrap">
              <span className="doctor-ai-copilot-popover__badge" aria-hidden="true">
                <Icon name="sparkles" />
              </span>
              <div>
                <div className="doctor-ai-copilot-popover__title-row">
                  <h3 className="doctor-ai-copilot-popover__title">AI 临床辅诊中枢</h3>
                  <span className="doctor-ai-brand__title">AI 共写</span>
                </div>
                <span className="doctor-ai-copilot-popover__subtitle">
                  {isChronic ? '当前识别为【慢病复诊配药】场景' : isReport ? '当前识别为【报告回诊】场景' : '随行临床决策副驾'}
                </span>
              </div>
            </div>

            <div className="doctor-ai-copilot-popover__status-wrap">
              {generating ? (
                <span className="doctor-ai-status-pill is-generating">
                  <span className="doctor-ai-status-dot" aria-hidden="true" />
                  <span className="doctor-ai-status-text">正在共写…</span>
                </span>
              ) : (
                <span className={`doctor-ai-status-pill is-${error ? 'error' : current ? 'ready' : suggestion ? 'stale' : 'idle'}`} role="status">
                  <span className="doctor-ai-status-dot" aria-hidden="true" />
                  <span className="doctor-ai-status-text">
                    {error ? '整理未完成' : current ? '建议已准备好' : suggestion ? '资料已变化，等待更新' : '待分析'}
                  </span>
                </span>
              )}
              <button
                type="button"
                className="doctor-ai-copilot-popover__close"
                aria-label="关闭 AI 辅诊面板"
                onClick={() => setHubOpen(false)}
              >
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div className="doctor-ai-copilot-popover__body">
            {/* 1. Context Insight Card */}
            {sceneAssessment && (
              <section className={`doctor-ai-insight-card is-${sceneAssessment.badgeTone}`} aria-label="接诊情境洞察">
                <div className="doctor-ai-insight-card__head">
                  <span className="doctor-ai-insight-card__icon" aria-hidden="true">
                    <Icon name="clinical" />
                  </span>
                  <strong>接诊情境感知</strong>
                  <span className="doctor-ai-insight-card__tag">
                    {isChronic ? '慢病复诊配药' : isReport ? '报告回诊解读' : '常规门诊'}
                  </span>
                </div>
                <p className="doctor-ai-insight-card__summary">{sceneAssessment.summaryText}</p>

                {sceneAssessment.matchedConditions.length > 0 && (
                  <div className="doctor-ai-insight-card__pills">
                    <span className="doctor-ai-insight-card__label">慢病档案：</span>
                    {sceneAssessment.matchedConditions.map((cond) => (
                      <span key={cond} className="doctor-ai-condition-chip">{cond}</span>
                    ))}
                  </div>
                )}

                {sceneAssessment.reportHighlights.length > 0 && (
                  <div className="doctor-ai-insight-card__reports">
                    <span className="doctor-ai-insight-card__label">异常指标：</span>
                    <div className="doctor-ai-insight-card__report-list">
                      {sceneAssessment.reportHighlights.map((hl, idx) => (
                        <span key={idx} className="doctor-ai-report-highlight-pill">{hl}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 2. Scenario Quick Actions */}
            <section className="doctor-ai-quick-actions" aria-label="场景便捷操作">
              <div className="doctor-ai-quick-actions__title">
                <Icon name="sparkles" />
                <span>场景一键直达</span>
              </div>
              <div className="doctor-ai-quick-actions__grid">
                {isChronic && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="doctor-ai-quick-btn"
                      disabled={disabled || busy || !canAdopt || sceneLoading}
                      onClick={() => generateAndApply('原发性慢病规律复诊配药，目前病情平稳，无特殊不适，要求按医嘱续开长期用药。')}
                    >
                      <Icon name="sparkles" />
                      <span>⚡ 慢病极速复诊病历</span>
                    </Button>
                    {onOpenHistory && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="doctor-ai-quick-btn"
                        onClick={() => {
                          onOpenHistory()
                        }}
                      >
                        <Icon name="roadmap" />
                        <span>💊 调入历史处方续方</span>
                      </Button>
                    )}
                  </>
                )}

                {isReport && (
                  <>
                    {onOpenResults && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="doctor-ai-quick-btn"
                        onClick={() => {
                          onOpenResults()
                        }}
                      >
                        <Icon name="clinical" />
                        <span>🔬 查看检验检查结果</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="doctor-ai-quick-btn"
                      disabled={disabled || busy || !canAdopt || sceneLoading}
                      onClick={() => generateAndApply('看检查检验结果复诊，结合异常指标评估疗效并调整下一步诊疗。')}
                    >
                      <Icon name="sparkles" />
                      <span>📝 生成报告回诊记录</span>
                    </Button>
                  </>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  className="doctor-ai-btn--refresh doctor-ai-quick-btn"
                  aria-label="分析当前病历"
                  disabled={disabled || busy}
                  onClick={() => generate()}
                  title="根据当前病历重新分析"
                >
                  <Icon name="refresh" />
                  <span>{error ? '重试分析' : suggestion ? '更新病历建议' : '分析当前病历'}</span>
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  className="doctor-ai-btn--more doctor-ai-quick-btn"
                  aria-label="更多辅助"
                  onClick={() => {
                    onOpenDetail?.()
                  }}
                  title="打开右侧智医助理面板，查看全套辅助工具"
                >
                  <Icon name="menu" />
                  <span>更多辅助</span>
                </Button>
              </div>
            </section>

            {/* 3. Voice & Input Composer */}
            <section className="doctor-ai-cowrite__composer">
              <div className="doctor-ai-composer-card">
                <div className="doctor-ai-composer-card__head">
                  <div className="doctor-ai-composer-card__lead">
                    <span className="doctor-ai-composer-card__badge" aria-hidden="true">
                      <Icon name="mic" />
                    </span>
                    <label className="doctor-ai-composer-card__title" htmlFor={composerInputId}>
                      问诊要点或辅助要求
                    </label>
                    <span className="doctor-ai-composer-card__sub">支持语音与快捷口述</span>
                  </div>
                  <div className="doctor-ai-composer-card__actions">
                    {voiceInput}
                    {question.trim() && (
                      <Button
                        size="sm"
                        variant="text"
                        className="doctor-ai-btn--clear"
                        onClick={() => {
                          onQuestionChange('')
                          onClearVoice?.()
                        }}
                        title="清空已录入要点"
                      >
                        清空
                      </Button>
                    )}
                  </div>
                </div>

                {interimTranscript && (
                  <div className="doctor-ai-interim-live" role="status" aria-live="polite">
                    <span className="doctor-ai-voice-pulse" aria-hidden="true" />
                    <span className="doctor-ai-interim-live__tag">正在识别语音</span>
                    <span className="doctor-ai-interim-live__text">{interimTranscript}</span>
                  </div>
                )}

                <textarea
                  id={composerInputId}
                  className="ui-field__control doctor-ai-composer-field"
                  value={question}
                  maxLength={500}
                  rows={2}
                  disabled={disabled || inputBusy}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  placeholder={
                    isChronic
                      ? '输入或口述慢病复诊要点（如：血压控制良好，无不适，来配降压药），AI 将直接生成规范复诊病历。'
                      : isReport
                        ? '输入或口述报告回诊要点（如：看血常规化验单），AI 将结合报告异常直接生成规范回诊病历。'
                        : '输入患者描述或医生口述要点（如：感冒发热3天，最高体温39度）；AI 将直接规范生成完整病历段落。'
                  }
                />

                <div className="doctor-ai-composer-card__footer">
                  <div className="doctor-ai-composer-card__btns">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={disabled || busy || !canAdopt || !recordFeature || sceneLoading}
                      title="直接按问诊要点生成病历草稿并自动填充至各字段"
                      onClick={() => generateAndApply()}
                    >
                      <Icon name="sparkles" />
                      {generating ? 'AI 正在共写…' : '直接生成并带入病历'}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={disabled || busy}
                      title="生成建议并在下方展示段落对照，由您逐条勾选采纳"
                      onClick={() => {
                        setReviewOpen(true)
                        generate()
                      }}
                    >
                      整理并对照建议
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Stepper & Diagnostics Details */}
            {generating && (
              <div className="doctor-ai-generation-box" role="status" aria-live="polite">
                <div className="doctor-ai-generation-box__header">
                  <span className="doctor-ai-generation__orb" aria-hidden="true">
                    <Icon name="sparkles" />
                  </span>
                  <span className="doctor-ai-generation__label">
                    {preview.recordDraft.treatmentPlan ? '正在匹配诊断与院内方案' : '正在共写病历'}
                  </span>
                </div>
                <ClinicalAiPipelineStepper
                  generating={generating}
                  hasTreatmentPlan={Boolean(preview.recordDraft.treatmentPlan)}
                  current={current}
                  surfaces={surfaces}
                />
              </div>
            )}

            {/* 5. Toggles for Summary and Review */}
            {current && (
              <div className="doctor-ai-review-chips">
                <Button
                  size="sm"
                  variant="secondary"
                  className={`doctor-ai-btn--chip ${summaryOpen ? 'is-active' : ''}`}
                  aria-expanded={summaryOpen}
                  onClick={() => {
                    setSummaryOpen(!summaryOpen)
                    onView()
                  }}
                >
                  <Icon name="clinical" />
                  <span>接诊摘要{suggestion!.safetyAlerts.length > 0 ? ` · ${suggestion!.safetyAlerts.length} 项待核对` : ''}</span>
                </Button>

                {entries.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className={`doctor-ai-btn--chip ${reviewOpen ? 'is-active' : ''}`}
                    aria-expanded={reviewOpen}
                    onClick={() => {
                      setReviewOpen(!reviewOpen)
                      onView()
                    }}
                  >
                    <Icon name="check" />
                    <span>{reviewOpen ? '收起对照' : `段落对照 · ${entries.length}`}</span>
                  </Button>
                )}
              </div>
            )}

            {/* Summary Details */}
            {summaryOpen && current && suggestion && (
              <div className="doctor-ai-brief__result">
                <p>{suggestion.summary}</p>
                {capability.features.includes('SAFETY_REMINDERS') &&
                  suggestion.safetyAlerts.map((item, index) => (
                    <p key={index}><strong>{item.title}</strong> · {item.detail}</p>
                  ))}
              </div>
            )}

            {/* Review & Paragraph Comparison */}
            {entries.length > 0 && reviewOpen && (
              <details className="doctor-ai-cowrite__review" open>
                <summary>段落对照 · {entries.length} 项建议</summary>
                <div className="doctor-ai-cowrite__fields">
                  {entries.map((field) => (
                    <article key={field}>
                      <label>
                        <input
                          type="checkbox"
                          checked={fields.includes(field)}
                          disabled={!current || busy || disabled || !canAdopt}
                          onChange={() => setFields(toggle(fields, field))}
                        />
                        <strong>{recordDraftFieldLabels[field]}</strong>
                        <small>{context[field]?.trim() ? '采纳将替换本段' : '补充空白段落'}</small>
                      </label>
                      <div className="doctor-ai-cowrite__comparison">
                        <div>
                          <small>当前内容</small>
                          <p>{context[field] || '尚未填写'}</p>
                        </div>
                        <FormField label={`${recordDraftFieldLabels[field]}建议（可编辑）`}>
                          <textarea
                            className="ui-field__control doctor-ai-comparison-textarea"
                            rows={3}
                            value={edited[field] ?? suggestion!.recordDraft[field] ?? ''}
                            disabled={!current || busy || disabled}
                            onChange={(event) => setEdited({ ...edited, [field]: event.target.value })}
                          />
                        </FormField>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="doctor-ai-review-actions">
                  <small>仅替换勾选段落；采纳后可撤销本次病历修改。</small>
                  <Button size="sm" variant="secondary" disabled={adoptionDisabled} onClick={applySelection}>
                    采纳所选草稿{selectionCount > 0 ? `（${selectionCount}）` : ''}
                  </Button>
                </div>
              </details>
            )}

            {error && <p className="doctor-ai-inline__stale" role="alert">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
