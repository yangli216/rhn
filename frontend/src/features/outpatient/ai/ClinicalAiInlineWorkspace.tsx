import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ClinicalAiCapabilities, ClinicalAiDraftContext, ClinicalAiRecordDraft,
  ClinicalAiSuggestion, ClinicalAiRecommendedPlan, ClinicalAiTreatmentRecommendation } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import { Button, FormField, Icon, Select } from '../../../shared/ui'
import type { ClinicalAiPreview } from '../../../shared/api/clinicalAiStream'
import { recordDraftFields, recordDraftFieldLabels } from './aiDraftAdapter'
import type { ReceptionSceneAssessment, ReceptionSceneType } from './receptionSceneAssessment'

export interface ClinicalAiSurfaces {
  summary: HTMLDivElement | null
  note: HTMLDivElement | null
  diagnoses: HTMLDivElement | null
  plans: HTMLDivElement | null
  detail: HTMLDivElement | null
}

export type ClinicalAiSurfaceRefs = Pick<Record<keyof ClinicalAiSurfaces,
  (element: HTMLDivElement | null) => void>, 'note' | 'diagnoses' | 'plans'>

export interface InlineAiSelection {
  recordDraft?: ClinicalAiRecordDraft
  diagnoses?: DiagnosisInput[]
}

/** One analysis session, rendered beside the clinical objects it can help edit. */
export function ClinicalAiInlineWorkspace({ surfaces, context, capability, suggestion, current, busy,
  generating, inputBusy, preview, background, autoEnabled, onAutoEnabledChange, onView, disabled, canAdopt, error, voiceInput, interimTranscript, question, onQuestionChange, onClearVoice, onGenerate, onApply,
  onReviewPlan, onReviewTreatment, existingTreatmentKeys = [], onOpenDetail, onOpenHistory, onOpenResults, templatesPending, sceneAssessment, sceneOverride, onSceneChange, conditionOptions = [], onConditionsChange, reportOptions = [], onReportsChange, sceneLoading, sceneError }: {
  surfaces: ClinicalAiSurfaces
  context: ClinicalAiDraftContext
  capability: ClinicalAiCapabilities
  suggestion: ClinicalAiSuggestion | null
  current: boolean
  busy: boolean
  generating: boolean
  inputBusy: boolean
  preview: ClinicalAiPreview
  background: boolean
  autoEnabled: boolean
  onAutoEnabledChange: (value: boolean) => void
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
  onReviewTreatment?: (items: ClinicalAiTreatmentRecommendation[]) => void
  existingTreatmentKeys?: string[]
  onReviewPlan: (plan: ClinicalAiRecommendedPlan) => void
  onOpenDetail?: () => void
  onOpenHistory?: () => void
  onOpenResults?: () => void
  templatesPending: boolean
  sceneAssessment?: ReceptionSceneAssessment
  sceneOverride?: ReceptionSceneType | ''
  onSceneChange?: (scene: ReceptionSceneType | '') => void
  conditionOptions?: string[]
  onConditionsChange?: (conditions: string[]) => void
  reportOptions?: Array<{ id: string; reportName: string; issuedAt: string }>
  onReportsChange?: (ids: string[]) => void
  sceneLoading?: boolean
  sceneError?: boolean
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [fields, setFields] = useState<string[]>([])
  const [edited, setEdited] = useState<ClinicalAiRecordDraft>({})
  const [pendingDirectApplyId, setPendingDirectApplyId] = useState<string | null>(null)
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([])

  useEffect(() => { setFields([]); setEdited({}) }, [suggestion?.id])
  const availableTreatmentItems = capability.features.includes('PLAN_RECOMMENDATIONS')
    ? (suggestion?.treatmentRecommendations ?? []).filter((item) => !existingTreatmentKeys.includes(treatmentKey(item))) : []
  const treatmentItems = current ? availableTreatmentItems : []
  const treatmentSignature = availableTreatmentItems.map(treatmentKey).join('|')
  useEffect(() => { setSelectedTreatments(availableTreatmentItems.map(treatmentKey)) }, [suggestion?.id, treatmentSignature])
  useEffect(() => { if (current && (reviewOpen || summaryOpen)) onView() }, [current, reviewOpen, summaryOpen, suggestion?.id, onView])

  useEffect(() => {
    if (!pendingDirectApplyId || busy) return
    setPendingDirectApplyId(null)
    if (current && canAdopt && !disabled && !error && suggestion?.id === pendingDirectApplyId
      && capability.features.includes('RECORD_COMPLETENESS')) {
      const recordDraft = Object.fromEntries(recordDraftFields.filter((field) => suggestion.recordDraft[field]?.trim())
        .map((field) => [field, suggestion.recordDraft[field]]))
      if (Object.keys(recordDraft).length) onApply({ recordDraft })
    }
  }, [pendingDirectApplyId, busy, current, canAdopt, disabled, error, suggestion, capability.features, onApply])

  const generate = (focus?: string) => {
    setPendingDirectApplyId(null); setComposerOpen(true); setReviewOpen(true)
    void onGenerate(focus).catch(() => undefined)
  }
  const generateAndApply = async (focus?: string) => {
    setPendingDirectApplyId(null); setComposerOpen(false)
    try { setPendingDirectApplyId(await onGenerate(focus)) } catch { setPendingDirectApplyId(null) }
  }
  const recordFeature = capability.features.includes('RECORD_COMPLETENESS')
  const diagnosisFeature = capability.features.includes('TERMINOLOGY_VALIDATION')
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
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
  const actions = <Button size="sm" variant="secondary" disabled={adoptionDisabled} onClick={applySelection}>
    采纳所选草稿{selectionCount > 0 ? `（${selectionCount}）` : ''}</Button>
  const portal = (node: ReactNode, target: HTMLDivElement | null, key: string) => target ? createPortal(node, target, key) : null

  return <>
    {portal(<section className="doctor-ai-inline doctor-ai-cowrite" aria-label="AI 病历共写">
      <header className="doctor-ai-cowrite__header">
        <div className="doctor-ai-cowrite__lead">
          <div className="doctor-ai-brand">
            <span className="doctor-ai-brand__icon" aria-hidden="true"><Icon name="sparkles" /></span>
            <strong className="doctor-ai-brand__title">AI 病历共写</strong>
          </div>
          {generating ? <span className="doctor-ai-generation" role="status" aria-live="polite">
            <span className="doctor-ai-generation__orb" aria-hidden="true"><Icon name="sparkles" /></span>
            <span className="doctor-ai-generation__label">{preview.recordDraft.treatmentPlan ? '正在匹配诊断与院内方案' : '正在共写病历'}</span>
            <span className="doctor-ai-generation__dots" aria-hidden="true"><i /><i /><i /></span>
            <small>病历 → 诊断 → 治疗建议</small>
          </span> : <span className={`doctor-ai-status-pill is-${error && background ? 'error' : current ? 'ready' : suggestion ? 'stale' : 'idle'}`} role="status">
            <span className="doctor-ai-status-dot" aria-hidden="true" />
            <span className="doctor-ai-status-text">{error && background ? '自动整理未完成' : current ? '建议已准备好' : suggestion ? '资料已变化，等待更新' : '输入问诊要点后准备建议'}</span>
          </span>}
          {current && <Button size="sm" variant="secondary" className={`doctor-ai-btn--chip ${summaryOpen ? 'is-active' : ''}`} aria-expanded={summaryOpen}
            onClick={() => { setSummaryOpen(!summaryOpen); onView() }}>
            <Icon name="clinical" />
            <span>接诊摘要{suggestion!.safetyAlerts.length > 0 ? ` · ${suggestion!.safetyAlerts.length} 项待核对` : ''}</span>
          </Button>}
          {current && entries.length > 0 && <Button size="sm" variant="secondary" className={`doctor-ai-btn--chip ${reviewOpen ? 'is-active' : ''}`}
            aria-expanded={reviewOpen} onClick={() => { setReviewOpen(!reviewOpen); onView() }}>
            <Icon name="check" />
            <span>{reviewOpen ? '收起对照' : `段落对照 · ${entries.length}`}</span>
          </Button>}
        </div>
        <div className="doctor-ai-inline__actions">
          {capability.features.includes('BACKGROUND_DRAFT') && <label className="doctor-ai-quiet__switch" title="病历内容变更时在后台自动准备AI分析建议">
            <input type="checkbox" checked={autoEnabled} onChange={(event) => onAutoEnabledChange(event.target.checked)} />
            <span className="doctor-ai-switch__track" aria-hidden="true"><span className="doctor-ai-switch__thumb" /></span>
            <span>自动准备</span>
          </label>}
          <Button size="sm" variant="secondary" className="doctor-ai-btn--refresh" disabled={disabled || busy} onClick={() => generate()}
            title="根据当前病历重新分析">
            <Icon name="refresh" />
            <span>{error ? '重新分析' : suggestion ? '更新分析' : '分析当前病历'}</span>
          </Button>
          <Button size="sm" variant="secondary" className={`doctor-ai-entrance-btn ${composerOpen ? 'is-active' : ''}`}
            aria-expanded={composerOpen} onClick={() => setComposerOpen(!composerOpen)}
            title={composerOpen ? '收起口述与输入面板' : '展开口述或输入问诊要点，由 AI 协助生成病历与推荐方案'}>
            <span className="doctor-ai-entrance-btn__mic-badge" aria-hidden="true">
              <Icon name="mic" />
            </span>
            <span>口述 / 输入要点</span>
            <span className="doctor-ai-entrance-btn__chevron" aria-hidden="true">
              <Icon name={composerOpen ? 'chevron-up' : 'chevron-down'} />
            </span>
          </Button>
          <Button size="sm" variant="text" className="doctor-ai-btn--more" onClick={onOpenDetail}
            title="打开右侧智医助理面板，查看全套辅助工具">
            <Icon name="menu" />
            <span>更多辅助</span>
          </Button>
        </div>
      </header>
      {summaryOpen && current && suggestion && <div className="doctor-ai-brief__result">
        <p>{suggestion.summary}</p>
        {capability.features.includes('SAFETY_REMINDERS') && suggestion.safetyAlerts.map((item, index) =>
          <p key={index}><strong>{item.title}</strong> · {item.detail}</p>)}
        <div className="doctor-ai-inline__actions"><small>基于生成时的病历与可用资料，待医生核对。</small>
          <Button size="sm" variant="text" onClick={onOpenHistory}>就诊历史</Button>
          <Button size="sm" variant="text" onClick={onOpenResults}>检查结果</Button></div>
      </div>}
      {error && !background && <p className="doctor-ai-inline__stale" role="alert">{error}</p>}
      {sceneAssessment && (
        <div className={`doctor-ai-scene-bar is-${sceneAssessment.scene.toLowerCase()}`}>
          <div className="doctor-ai-scene-bar__info">
            <span className={`doctor-ai-scene-badge is-${sceneAssessment.badgeTone}`}>
              <Icon name={sceneAssessment.scene === 'CHRONIC_REFILL' ? 'roadmap' : sceneAssessment.scene === 'REPORT_FOLLOW_UP' ? 'clinical' : 'sparkles'} />
              {sceneAssessment.sceneLabel}
            </span>
            <span className="doctor-ai-scene-bar__text">{sceneOverride ? '已手动选择场景，生成仍以实际就诊资料为依据。' : sceneAssessment.summaryText}</span>
            <Select aria-label="接诊场景" value={sceneOverride || ''} disabled={busy || disabled}
              clearable={false} searchable={false} popoverMinWidth={176}
              options={[
                { value: '', label: '自动识别' },
                { value: 'FIRST_VISIT', label: '初诊全科接诊' },
                { value: 'CHRONIC_REFILL', label: '慢病复诊配药' },
                { value: 'REPORT_FOLLOW_UP', label: '报告回诊' },
              ]}
              onChange={(value) => onSceneChange?.(value as ReceptionSceneType | '')} />
          </div>
          {sceneLoading && <small role="status">正在读取关联报告，场景识别将更新…</small>}
          {sceneError && <small role="status">部分报告读取失败，场景依据不完整；可重试或查看原始报告。</small>}
          {sceneAssessment.scene === 'CHRONIC_REFILL' && conditionOptions.length > 0 && <div className="doctor-ai-scene-bar__conditions" aria-label="本次复诊病种">
            {conditionOptions.map((condition) => <label key={condition}><input type="checkbox"
              checked={sceneAssessment.matchedConditions.includes(condition)} disabled={busy || disabled}
              onChange={() => onConditionsChange?.(toggle(sceneAssessment.matchedConditions, condition))} />{condition}</label>)}
          </div>}
          {sceneAssessment.scene === 'REPORT_FOLLOW_UP' && reportOptions.length > 0 && <details className="doctor-ai-scene-bar__reports">
            <summary>本次解读报告 · 已选 {sceneAssessment.selectedReportIds.length} 份</summary>
            {reportOptions.map((report) => <label key={report.id}><input type="checkbox"
              checked={sceneAssessment.selectedReportIds.includes(report.id)} disabled={busy || disabled}
              onChange={() => onReportsChange?.(toggle(sceneAssessment.selectedReportIds, report.id))} />
              {report.reportName} · {report.issuedAt?.slice(0, 10)}</label>)}
          </details>}
          {sceneAssessment.reportHighlights.length > 0 && <ul className="doctor-ai-scene-bar__highlights">
            {sceneAssessment.reportHighlights.map((item) => <li key={item}>{item}</li>)}</ul>}
          <div className="doctor-ai-scene-bar__actions">
            {sceneAssessment.scene === 'CHRONIC_REFILL' && <Button size="sm" variant="text" onClick={onOpenHistory}>历史处方参考 / 续方</Button>}
            {sceneAssessment.scene === 'REPORT_FOLLOW_UP' && <Button size="sm" variant="text" onClick={onOpenResults}>查看原始报告</Button>}
            {sceneAssessment.scene !== 'FIRST_VISIT' && (
              <Button size="sm" variant="secondary" disabled={disabled || busy || !canAdopt || !recordFeature || sceneLoading
                  || (sceneAssessment.scene === 'CHRONIC_REFILL' && !sceneAssessment.matchedConditions.length)
                  || (sceneAssessment.scene === 'REPORT_FOLLOW_UP' && !sceneAssessment.selectedReportIds.length)}
                title="结合已知病史和报告生成病历草稿，带入后请核对"
                onClick={() => void generateAndApply(sceneAssessment.scene === 'CHRONIC_REFILL'
                  ? '结合选定慢病与历史用药生成复诊配药病历，未知控制情况和依从性标记待核实。'
                  : '结构化解读选定报告，并将报告事实、谨慎分析及随访建议整理成回诊病历。')}>
                <Icon name="sparkles" />{sceneAssessment.scene === 'CHRONIC_REFILL' ? '一键生成复诊病历' : '一键解读并生成回诊病历'}
              </Button>
            )}
          </div>
        </div>
      )}
      {composerOpen && <div className="doctor-ai-cowrite__composer">
        <div className="doctor-ai-composer-card">
          <div className="doctor-ai-composer-card__head">
            <div className="doctor-ai-composer-card__lead">
              <span className="doctor-ai-composer-card__badge" aria-hidden="true">
                <Icon name="clinical" />
              </span>
              <span className="doctor-ai-composer-card__title">问诊要点与口述录入</span>
              <span className="doctor-ai-composer-card__sub">键盘输入或点击右侧语音输入，边说边自动转写</span>
            </div>
            <div className="doctor-ai-composer-card__actions">
              {voiceInput}
              {question.trim() && (
                <Button size="sm" variant="text" className="doctor-ai-btn--clear"
                  onClick={() => { onQuestionChange(''); onClearVoice?.() }}
                  title="清空已录入要点">
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

          <FormField label="问诊要点或辅助要求" className="doctor-ai-composer-field">
            <textarea value={question} maxLength={500} rows={2}
              disabled={disabled || inputBusy} onChange={(event) => onQuestionChange(event.target.value)}
              placeholder={sceneAssessment?.scene === 'CHRONIC_REFILL'
                ? '输入或口述慢病复诊要点（如：血压控制良好，无不适，来配降压药），AI 将直接生成规范复诊病历。'
                : sceneAssessment?.scene === 'REPORT_FOLLOW_UP'
                  ? '输入或口述报告回诊要点（如：看血常规化验单），AI 将结合报告异常直接生成规范回诊病历。'
                  : '输入患者描述或医生口述要点（如：感冒发热3天，最高体温39度）；AI 将直接规范生成完整病历段落。'} />
          </FormField>

          <div className="doctor-ai-composer-card__footer">
            <div className="doctor-ai-composer-card__btns">
              <Button size="sm" variant="primary" disabled={disabled || busy || !canAdopt || !recordFeature || sceneLoading}
                title="直接按问诊要点生成病历草稿并自动填充至各字段"
                onClick={() => generateAndApply()}>
                <Icon name="sparkles" />{generating ? 'AI 正在共写…' : '直接生成并带入病历'}
              </Button>
              <Button size="sm" variant="secondary" disabled={disabled || busy}
                title="生成建议并在下方展示段落对照，由您逐条勾选采纳"
                onClick={() => generate()}>
                整理并对照建议
              </Button>
            </div>
            <div className="doctor-ai-composer-card__hint">
              {current && entries.length === 0 && !generating ? (
                <span className="doctor-ai-composer-card__hint-alert">本次未生成可采纳的病历段落</span>
              ) : (
                <span>录入后可直接生成并自动填充至主诉、现病史等，支持随时一键撤销。</span>
              )}
            </div>
          </div>
        </div>
      </div>}
      {entries.length > 0 && reviewOpen && <details className="doctor-ai-cowrite__review" open>
        <summary>段落对照 · {entries.length} 项建议</summary>
        <div className="doctor-ai-cowrite__fields">{entries.map((field) => <article key={field}>
          <label><input type="checkbox" checked={fields.includes(field)} disabled={!current || busy || disabled || !canAdopt}
            onChange={() => setFields(toggle(fields, field))} /><strong>{recordDraftFieldLabels[field]}</strong>
            <small>{context[field]?.trim() ? '采纳将替换本段' : '补充空白段落'}</small></label>
          <div className="doctor-ai-cowrite__comparison"><div><small>当前内容</small><p>{context[field] || '尚未填写'}</p></div>
            <FormField label={`${recordDraftFieldLabels[field]}建议（可编辑）`}><textarea rows={3}
              value={edited[field] ?? suggestion!.recordDraft[field] ?? ''} disabled={!current || busy || disabled}
              onChange={(event) => setEdited({ ...edited, [field]: event.target.value })} /></FormField></div>
        </article>)}</div>
      </details>}
      {reviewOpen && current && recordFeature && Boolean(suggestion?.missingInformation.length) && <details className="doctor-ai-inline__missing">
        <summary>建议补问 / 补录 · {suggestion!.missingInformation.length} 项</summary>
        <ul>{suggestion!.missingInformation.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      {reviewOpen && entries.length > 0 && <footer><small>仅替换勾选段落；采纳后可撤销本次病历修改。</small>{actions}</footer>}
    </section>, surfaces.note, 'note')}

    {current && diagnosisFeature && Boolean(suggestion?.diagnosisCandidates.some((item) =>
      !context.diagnoses.some((diagnosis) => diagnosis.code.toUpperCase() === item.code.toUpperCase()))) && portal(
      <div className="doctor-ai-diagnosis-suggestions" aria-label="AI 诊断待确认">
        {suggestion!.diagnosisCandidates.map((item) => {
          const exists = context.diagnoses.some((diagnosis) => diagnosis.code.toUpperCase() === item.code.toUpperCase())
          if (exists) return null
          return <div className="doctor-diagnosis-row is-ai-suggestion" role="row" key={item.code}>
            <span className="doctor-diag-col-type"><span className="doctor-ai-pending-badge"><Icon name="sparkles" />AI 建议</span></span>
            <span className="doctor-diag-col-main"><span className="doctor-diag-name-wrap">
              <strong className="doctor-diag-name">{item.display}</strong><span className="doctor-diag-code-pill">{item.code}</span>
            </span></span>
            <span className="doctor-diag-col-domain"><span className="doctor-diag-badge is-secondary">待医生确认</span></span>
            <span className="doctor-diag-col-management" title={item.rationale || undefined}>{item.rationale || '请结合当前病历核对。'}</span>
            <span className="doctor-diag-col-actions"><Button size="sm" variant="secondary"
              disabled={disabled || busy || !canAdopt}
              onClick={() => onApply({ diagnoses: [{ code: item.code, display: item.display, type: item.type }] })}>确认录入</Button>
              <Button size="sm" variant="text" onClick={onOpenDetail}>查看依据</Button></span>
          </div>
        })}
      </div>, surfaces.diagnoses, 'diagnoses')}

    {current && planFeature && treatmentItems.length > 0 && portal(
      <div className="doctor-ai-order-suggestions" aria-label="AI 医嘱待确认">
        {treatmentItems.map((item) => <div className="doctor-unified-order-row is-ai-suggestion"
          role="row" key={treatmentKey(item)}>
          <span className="doctor-unified-cell-type"><label className="doctor-ai-order-select">
            <input type="checkbox" aria-label={`选择 ${item.name}`} checked={selectedTreatments.includes(treatmentKey(item))}
              disabled={disabled || busy || !canAdopt || !onReviewTreatment}
              onChange={() => setSelectedTreatments(toggle(selectedTreatments, treatmentKey(item)))} />
            <span className="doctor-ai-pending-badge"><Icon name="sparkles" />
            {{ MEDICATION: '药品', LABORATORY: '检验', EXAMINATION: '检查' }[item.type]}</span></label></span>
          <span className="doctor-unified-cell-name"><strong>{item.name}</strong><small>{item.code}</small></span>
          <span className="doctor-unified-cell-directions">{item.type === 'MEDICATION'
            ? '用法、剂量和疗程待核对' : '执行要求待核对'}</span>
          <span className="doctor-unified-cell-qty">—</span>
          <span className="doctor-unified-cell-instruction" title={item.rationale || undefined}>{item.rationale}</span>
          <span className="doctor-unified-cell-price">—</span>
          <span className="doctor-unified-cell-status"><span className="doctor-ai-review-status">AI 待确认</span></span>
          <span className="doctor-unified-cell-actions"><small>已选</small></span>
        </div>)}
        <div className="doctor-ai-order-batch" role="row">
          <span>AI 推荐 {treatmentItems.length} 项，已选 {selectedTreatments.length} 项；转入后仍需核对用法和执行要求。</span>
          <Button size="sm" variant="primary" disabled={disabled || busy || !canAdopt || !onReviewTreatment || selectedTreatments.length === 0}
            onClick={() => onReviewTreatment?.(treatmentItems.filter((item) => selectedTreatments.includes(treatmentKey(item))))}>
            <Icon name="check" />确认所选（{selectedTreatments.length}）</Button>
        </div>
      </div>, surfaces.plans, 'treatments')}
    {current && planFeature && Boolean(suggestion?.recommendedPlans.length) && portal(
      <div className="doctor-ai-order-suggestions" aria-label="AI 院内方案待确认">
        {suggestion!.recommendedPlans.map((plan) => <div className="doctor-unified-order-row is-ai-suggestion is-plan"
          role="row" key={plan.templateId}>
          <span className="doctor-unified-cell-type"><span className="doctor-ai-pending-badge"><Icon name="sparkles" />方案</span></span>
          <span className="doctor-unified-cell-name"><strong>{plan.name}</strong></span>
          <span className="doctor-unified-cell-directions">包含诊断、药品及诊疗项目</span>
          <span className="doctor-unified-cell-qty">—</span>
          <span className="doctor-unified-cell-instruction">{plan.rationale || plan.description}</span>
          <span className="doctor-unified-cell-price">—</span>
          <span className="doctor-unified-cell-status"><span className="doctor-ai-review-status">AI 待确认</span></span>
          <span className="doctor-unified-cell-actions"><Button size="sm" variant="secondary"
            disabled={disabled || busy || !current || !canAdopt || templatesPending}
            onClick={() => onReviewPlan(plan)}>核对方案</Button></span>
        </div>)}
      </div>, surfaces.plans, 'plans')}
  </>
}

function treatmentKey(item: ClinicalAiTreatmentRecommendation) {
  return `${item.type}:${item.catalogItemId}`
}
