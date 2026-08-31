import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClinicalAiDraftContext, ClinicalAiRecommendedPlan, ClinicalAiSuggestion,
  ClinicalAiSuggestionEventType,
} from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, StatusBadge } from '../../../shared/ui'
import {
  canApplyClinicalAiSuggestion, clinicalAiContextFingerprint, clinicalAiDraftInput, type ClinicalAiDraftRequest,
  recordDraftFieldLabels, recordDraftFields,
} from './aiDraftAdapter'

interface AiAdoptionIntent {
  suggestion: ClinicalAiSuggestion
  request: ClinicalAiDraftRequest
  sectionCode: string
  commandCode: string
  planTemplateId?: string
  closePlan?: boolean
}

export function ClinicalAiAssistantPanel({ encounter, currentContext, allergies, allergyState, api, disabled,
  onAdoptionBusyChange, onApply }: {
  encounter: Encounter
  currentContext: ClinicalAiDraftContext
  allergies: AllergyIntolerance[]
  allergyState: ClinicalAiDraftContext['allergyState']
  api: RhnApi
  disabled: boolean
  onAdoptionBusyChange: (busy: boolean) => void
  onApply: (request: ClinicalAiDraftRequest) => void
}) {
  const [question, setQuestion] = useState('')
  const [suggestion, setSuggestion] = useState<ClinicalAiSuggestion | null>(null)
  const [localError, setLocalError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<ClinicalAiRecommendedPlan | null>(null)
  const viewed = useRef(new Set<string>())
  const adoptionCommands = useRef(new Map<string, string>())
  const latestContext = useRef(currentContext)
  const latestAllergyState = useRef(allergyState)
  latestContext.current = currentContext
  latestAllergyState.current = allergyState
  const scopeKey = [encounter.organizationId, encounter.departmentId, encounter.clinicianId ?? 'UNASSIGNED']
  const capabilities = useQuery({ queryKey: ['clinical-ai-capabilities', ...scopeKey], queryFn: api.clinicalAi.capabilities,
    staleTime: 5 * 60 * 1000, retry: false })
  const templates = useQuery({
    queryKey: ['outpatient-plan-templates', 'ai-assistant', ...scopeKey],
    queryFn: () => api.outpatientPlanTemplates.list(),
    enabled: Boolean(suggestion?.recommendedPlans.length
      && capabilities.data?.features.includes('PLAN_RECOMMENDATIONS')),
  })
  const generate = useMutation({
    mutationFn: () => {
      const context = latestContext.current
      if (disabled || context.busy || context.encounterId !== encounter.id
        || context.residentId !== encounter.residentId) {
        throw new Error('当前就诊上下文正在变化，请稍后再分析。')
      }
      return api.clinicalAi.generate(encounter.id, {
        clientContextFingerprint: clinicalAiContextFingerprint(context),
        question: question.trim() || undefined,
        draft: clinicalAiDraftInput(context),
      })
    },
    onSuccess: (value) => { setSuggestion(value); setLocalError('') },
  })
  const adoptDraft = useMutation({
    mutationFn: async (value: AiAdoptionIntent) => {
      requireCurrentAdoption(value.suggestion, value.request, latestContext.current, encounter)
      let request = value.request
      if (request.diagnoses?.length) {
        request = { ...request, diagnoses: await canonicalizeActiveDiagnoses(api, request.diagnoses) }
      }
      if (value.planTemplateId) {
        if (latestAllergyState.current !== 'READY' || latestContext.current.allergyState !== 'READY') {
          throw new Error('患者过敏信息尚未就绪，不能带入诊疗方案。')
        }
        const planTemplate = await api.outpatientPlanTemplates.use(value.planTemplateId)
        if (latestAllergyState.current !== 'READY') {
          throw new Error('患者过敏信息在方案核对期间发生刷新，不能带入诊疗方案。')
        }
        const planDiagnoses = await canonicalizeActiveDiagnoses(api, planTemplate.diagnoses)
        request = { ...request, planTemplate: { ...planTemplate, diagnoses: planDiagnoses } }
      }
      requireCurrentAdoption(value.suggestion, request, latestContext.current, encounter)
      await api.clinicalAi.recordEvent(value.suggestion.id,
        eventInput(value.suggestion, 'ADOPTED', value.sectionCode, value.commandCode))
      return { ...value, request }
    },
    onSuccess: (value) => {
      if (!guardCurrent(value.suggestion, latestContext.current, setLocalError, value.request, encounter)) return
      adoptionCommands.current.delete(`${value.suggestion.id}:${value.sectionCode}`)
      if (value.closePlan) setSelectedPlan(null)
      onApply(value.request)
    },
  })
  const ignoreSuggestion = useMutation({
    mutationFn: (value: ClinicalAiSuggestion) => api.clinicalAi.recordEvent(value.id,
      eventInput(value, 'IGNORED', 'ALL')),
    onSuccess: () => { setSuggestion(null); setLocalError('') },
  })
  const actionPending = generate.isPending || adoptDraft.isPending || ignoreSuggestion.isPending
  useEffect(() => {
    onAdoptionBusyChange(adoptDraft.isPending)
    return () => onAdoptionBusyChange(false)
  }, [adoptDraft.isPending, onAdoptionBusyChange])
  useEffect(() => {
    if (!suggestion || viewed.current.has(suggestion.id)) return
    if (!capabilities.data?.features.includes('AUDIT_TRAIL')) return
    viewed.current.add(suggestion.id)
    void api.clinicalAi.recordEvent(suggestion.id, eventInput(suggestion, 'VIEWED', 'RESULT')).catch(() => undefined)
  }, [api, capabilities.data?.features, suggestion])

  const current = suggestion ? canApplyClinicalAiSuggestion(suggestion, currentContext) : false
  const capabilityError = capabilities.error
  const error = generate.error || templates.error || adoptDraft.error || ignoreSuggestion.error

  const ignore = () => {
    if (!suggestion || actionPending) return
    ignoreSuggestion.mutate(suggestion)
  }

  if (capabilities.isPending) return <LoadingState label="正在连接智医助理…" />
  if (capabilityError) return <EmptyState icon="clinical" title="智医助理暂不可用"
    copy="AI 能力连接失败；不会影响当前病历、诊断和医嘱操作。" />
  const capability = capabilities.data
  if (!capability?.available || capability.mode === 'DISABLED') return <EmptyState icon="clinical"
    title="智医助理尚未启用" copy={capability?.message || '配置 AI 服务后即可使用；医生站其他功能不受影响。'} />

  const recordFeature = capability.features.includes('RECORD_COMPLETENESS')
  const diagnosisFeature = capability.features.includes('TERMINOLOGY_VALIDATION')
  const safetyFeature = capability.features.includes('SAFETY_REMINDERS')
  const planFeature = capability.features.includes('PLAN_RECOMMENDATIONS')
  const auditFeature = capability.features.includes('AUDIT_TRAIL')
  const recordEntries = suggestion && recordFeature ? recordDraftFields
    .filter((field) => suggestion.recordDraft[field]?.trim())
    .map((field) => ({ field, label: recordDraftFieldLabels[field], value: suggestion.recordDraft[field]! })) : []
  const diagnosisDrafts = suggestion && diagnosisFeature
    ? suggestion.diagnosisCandidates.map(({ code, display, type }) => ({ code, display, type })) : []
  const applyRecordAndDiagnoses = () => {
    if (!suggestion || !guardCurrent(suggestion, latestContext.current, setLocalError, undefined, encounter)) return
    const hasRecord = recordEntries.length > 0
    if (!hasRecord && diagnosisDrafts.length === 0) return
    const context = latestContext.current
    const sectionCode = 'RECORD_DIAGNOSIS'
    adoptDraft.mutate({ suggestion, sectionCode,
      commandCode: adoptionCommand(adoptionCommands.current, suggestion.id, sectionCode), request: {
      requestId: globalThis.crypto.randomUUID(), sourceSuggestionId: suggestion.id,
      encounterId: context.encounterId, residentId: context.residentId,
      contextFingerprint: suggestion.clientContextFingerprint, sourceLabel: '智医助理建议',
      recordDraft: hasRecord ? suggestion.recordDraft : undefined,
      diagnoses: diagnosisDrafts.length ? diagnosisDrafts : undefined,
    } })
  }

  return <div className="doctor-ai-assistant">
    <section className="doctor-ai-assistant__guardrail" aria-label="AI 使用边界">
      <Icon name="sparkles" /><div><strong>AI 只生成建议草稿</strong>
        <small>不会自动保存病历、确认诊断、开立医嘱或完成诊毕。</small></div>
      <StatusBadge tone={capability.mode === 'MODEL' ? 'success' : 'neutral'}>
        {capability.mode === 'MODEL' ? '模型辅助' : '本地辅助'}</StatusBadge>
    </section>
    <section className="doctor-ai-assistant__prompt">
      <FormField label="本次希望重点辅助什么"><textarea value={question} maxLength={500} disabled={actionPending}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="例如：补全病历要点、检查诊断遗漏、推荐已有诊疗方案（可不填）" /></FormField>
      <div className="doctor-ai-assistant__quick-prompts" aria-label="快捷辅助方向">
        {['补全病历要点', '检查危险信号', '核对诊断遗漏'].map((value) => <button type="button" key={value}
          disabled={actionPending} onClick={() => setQuestion(value)}>{value}</button>)}
      </div>
      <Button busy={generate.isPending} disabled={disabled || actionPending}
        onClick={() => generate.mutate()}><Icon name="sparkles" />分析当前就诊</Button>
    </section>
    {!auditFeature && <Alert>当前 AI 能力未声明审计留痕支持，因此仅展示建议，不允许带入草稿。</Alert>}
    {(error || localError) && <Alert>{localError || errorMessage(error)}</Alert>}
    {suggestion ? <>
      {!current && <Alert>当前草稿已变化或建议已经过期。为避免串写，请重新分析后再带入。</Alert>}
      <SuggestionResult suggestion={suggestion} recordEntries={recordEntries}
        showMissing={recordFeature} showSafety={safetyFeature} showDiagnoses={diagnosisFeature} />
      {(recordFeature || diagnosisFeature) && <div className="doctor-ai-assistant__actions">
        <Button busy={adoptDraft.isPending} disabled={disabled || actionPending || !current
          || !auditFeature || recordEntries.length === 0 && diagnosisDrafts.length === 0}
          onClick={applyRecordAndDiagnoses}>带入病历与诊断草稿</Button>
        <Button variant="secondary" busy={ignoreSuggestion.isPending}
          disabled={actionPending || !auditFeature} onClick={ignore}>忽略本次建议</Button>
      </div>}
      {planFeature && suggestion.recommendedPlans.length > 0 && <section className="doctor-ai-assistant__plans">
        <header><strong>已有诊疗方案</strong><small>仅推荐院内已维护、当前医生可见的方案</small></header>
        {suggestion.recommendedPlans.map((plan) => <article key={plan.templateId}>
          <div><strong>{plan.name}</strong><small>{plan.description || plan.rationale}</small></div>
          <Button size="sm" variant="secondary" disabled={disabled || actionPending || !current
            || !auditFeature || templates.isPending}
            onClick={() => setSelectedPlan(plan)}>核对后带入</Button>
        </article>)}
      </section>}
      <footer className="doctor-ai-assistant__disclaimer">{suggestion.disclaimer}</footer>
      {auditFeature && <div className="doctor-ai-assistant__feedback"><span>这次建议是否有帮助？</span>
        <Button size="sm" variant="text" disabled={actionPending}
          onClick={() => void recordEvent(api, suggestion, 'FEEDBACK_POSITIVE', 'RESULT')}>有帮助</Button>
        <Button size="sm" variant="text" disabled={actionPending}
          onClick={() => void recordEvent(api, suggestion, 'FEEDBACK_NEGATIVE', 'RESULT')}>需改进</Button>
      </div>}
    </> : <EmptyState icon="clinical" title="尚未生成本次建议"
      copy="助理会基于当前就诊和院内可用数据查漏补缺，结果由你决定是否带入草稿。" />}
    {selectedPlan && <AiPlanReviewDialog recommendation={selectedPlan}
      template={templates.data?.find((value) => value.id === selectedPlan.templateId)}
      allergies={allergies} allergyState={allergyState} suggestion={suggestion!}
      recordAvailable={recordEntries.length > 0} diagnosisAvailable={diagnosisDrafts.length > 0}
      disabled={disabled || !current || !auditFeature} busy={adoptDraft.isPending} error={adoptDraft.error}
      onClose={() => setSelectedPlan(null)} onApply={(template, safetyConfirmed, overrideReason, includeClinicalDraft) => {
        if (!guardCurrent(suggestion!, latestContext.current, setLocalError, undefined, encounter)) return
        const context = latestContext.current
        const sectionCode = includeClinicalDraft ? 'ALL' : `PLAN:${template.id}`
        adoptDraft.mutate({ suggestion: suggestion!, planTemplateId: template.id, closePlan: true,
          sectionCode, commandCode: adoptionCommand(adoptionCommands.current, suggestion!.id, sectionCode),
          request: { requestId: globalThis.crypto.randomUUID(), sourceSuggestionId: suggestion!.id,
            encounterId: context.encounterId, residentId: context.residentId,
            contextFingerprint: suggestion!.clientContextFingerprint,
            sourceLabel: `智医助理推荐方案“${template.name}”`,
            recordDraft: includeClinicalDraft && recordEntries.length ? suggestion!.recordDraft : undefined,
            diagnoses: includeClinicalDraft && diagnosisDrafts.length ? diagnosisDrafts : undefined,
            allergyReviewConfirmed: safetyConfirmed, allergyOverrideReason: overrideReason || undefined,
          } })
      }} />}
  </div>
}

function SuggestionResult({ suggestion, recordEntries, showMissing, showSafety, showDiagnoses }: {
  suggestion: ClinicalAiSuggestion
  recordEntries: Array<{ field: string; label: string; value: string }>
  showMissing: boolean
  showSafety: boolean
  showDiagnoses: boolean
}) {
  return <div className="doctor-ai-assistant__result">
    <section className="doctor-ai-assistant__summary"><span>就诊摘要</span><p>{suggestion.summary}</p></section>
    {showSafety && suggestion.safetyAlerts.length > 0 && <section className="doctor-ai-assistant__alerts">
      <header><strong>优先核对</strong></header>
      {suggestion.safetyAlerts.map((item, index) => <article className={`is-${item.level.toLowerCase()}`}
        key={`${item.title}-${index}`}><Icon name="warning" /><div><strong>{item.title}</strong><small>{item.detail}</small></div></article>)}
    </section>}
    {showMissing && suggestion.missingInformation.length > 0 && <section className="doctor-ai-assistant__missing">
      <header><strong>建议补问 / 补录</strong></header><ul>{suggestion.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>}
    {recordEntries.length > 0 && <section className="doctor-ai-assistant__record">
      <header><strong>病历草稿建议</strong><small>默认只补充当前空白段落</small></header>
      {recordEntries.map((item) => <article key={item.field}><span>{item.label}</span><p>{item.value}</p></article>)}
    </section>}
    {showDiagnoses && (suggestion.diagnosisCandidates.length > 0 || suggestion.differentialDiagnoses.length > 0)
      && <section className="doctor-ai-assistant__diagnoses"><header><strong>诊断辅助</strong><small>正式候选最多 3 项</small></header>
        {suggestion.diagnosisCandidates.map((item) => <article key={`candidate-${item.code}`}>
          <StatusBadge tone="success">候选</StatusBadge><div><strong>{item.display}</strong>
            <small>{item.code} · 置信度 {Math.round(item.confidence * 100)}% · {item.rationale}</small></div></article>)}
        {suggestion.differentialDiagnoses.map((item) => <article key={`differential-${item.code}`}>
          <StatusBadge tone="warning">待鉴别</StatusBadge><div><strong>{item.display}</strong>
            <small>{item.code} · {item.rationale}</small></div></article>)}
      </section>}
  </div>
}

function AiPlanReviewDialog({ recommendation, template, allergies, allergyState, suggestion,
  recordAvailable, diagnosisAvailable, disabled, busy, error, onClose, onApply }: {
  recommendation: ClinicalAiRecommendedPlan
  template?: OutpatientPlanTemplate
  allergies: AllergyIntolerance[]
  allergyState: ClinicalAiDraftContext['allergyState']
  suggestion: ClinicalAiSuggestion
  recordAvailable: boolean
  diagnosisAvailable: boolean
  disabled: boolean
  busy: boolean
  error: unknown
  onClose: () => void
  onApply: (template: OutpatientPlanTemplate, safetyConfirmed: boolean, overrideReason: string,
    includeClinicalDraft: boolean) => void
}) {
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [includeClinicalDraft, setIncludeClinicalDraft] = useState(recordAvailable || diagnosisAvailable)
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const matched = useMemo(() => template?.medications.flatMap((medication) => drugAllergies.filter((allergy) =>
    allergy.substanceCode?.toLowerCase() === medication.medicationCode.toLowerCase())) ?? [], [drugAllergies, template])
  const containsMedication = Boolean(template?.medications.length)
  const allergyReady = allergyState === 'READY'
  return <Dialog title={`核对“${recommendation.name}”`} eyebrow="智医助理 · 既有诊疗方案"
    description="AI 只负责推荐。系统将在你核对后把院内已维护方案加入待确认草稿，不会直接开立。"
    closeOnBackdrop={false} onClose={() => !busy && onClose()} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={disabled || busy || !template || !allergyReady || containsMedication
        && (!safetyConfirmed || matched.length > 0 && !overrideReason.trim())}
        onClick={() => onApply(template!, safetyConfirmed, overrideReason.trim(), includeClinicalDraft)}>
        确认带入草稿</Button>
    </>}>
    {!allergyReady && <Alert>{allergyState === 'LOADING'
      ? '患者过敏信息仍在加载，暂不能带入诊疗方案。'
      : '患者过敏信息加载失败，暂不能带入诊疗方案；请先刷新并完成核对。'}</Alert>}
    {!template ? <Alert>方案已停用或当前工作上下文不可见，请刷新后重试。</Alert> : <>
      <div className="doctor-plan-review">
        <div><span>诊断</span><strong>{template.diagnoses.length} 条</strong></div>
        <div><span>药品</span><strong>{template.medications.length} 条</strong></div>
        <div><span>诊疗项目</span><strong>{template.services.length} 条</strong></div>
      </div>
      <p className="doctor-ai-assistant__plan-reason">推荐理由：{recommendation.rationale}</p>
      {(recordAvailable || diagnosisAvailable) && <div className="doctor-template-safety-review">
        <label><input type="checkbox" checked={includeClinicalDraft} disabled={busy}
          onChange={(event) => setIncludeClinicalDraft(event.target.checked)} />
          <span><strong>同时带入{recordAvailable ? '病历' : ''}
            {recordAvailable && diagnosisAvailable ? '、' : ''}{diagnosisAvailable ? '诊断' : ''}建议</strong>
            <small>本次将以 ALL 一次留痕；所有内容仍只进入待核对草稿。</small></span></label>
      </div>}
      {containsMedication && <div className="doctor-template-safety-review">
        <label><input type="checkbox" checked={safetyConfirmed} disabled={!allergyReady || busy}
          onChange={(event) => setSafetyConfirmed(event.target.checked)} />
          <span><strong>已核对患者过敏信息及方案内全部药品</strong>
            <small>带入后仍需在原医嘱审核流程中核对目录、价格、库存和剂量。</small></span></label>
        {matched.length > 0 && <FormField label="命中过敏原，继续带入的临床理由" required>
          <textarea value={overrideReason} maxLength={1000} disabled={!allergyReady || busy}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder={`命中：${[...new Set(matched.map((item) => item.substanceDisplay))].join('、')}`} />
        </FormField>}
      </div>}
    </>}
    {Boolean(error) && <Alert>{errorMessage(error)}</Alert>}
    <small className="doctor-ai-assistant__audit-note">建议编号 {suggestion.id}，采纳动作将单独留痕。</small>
  </Dialog>
}

function guardCurrent(suggestion: ClinicalAiSuggestion, context: ClinicalAiDraftContext,
  setError: (value: string) => void, request?: ClinicalAiDraftRequest, encounter?: Encounter) {
  const anchorsMatch = (!encounter || context.encounterId === encounter.id
    && context.residentId === encounter.residentId)
    && (!request || request.encounterId === context.encounterId && request.residentId === context.residentId)
  const allowed = anchorsMatch && canApplyClinicalAiSuggestion(suggestion, context)
  if (!allowed) setError(anchorsMatch
    ? '当前草稿与建议生成时已经不同，请重新分析，避免把旧建议带入新内容。'
    : '当前患者或就诊已切换，系统已拒绝带入旧建议。')
  return allowed
}

function requireCurrentAdoption(suggestion: ClinicalAiSuggestion, request: ClinicalAiDraftRequest,
  context: ClinicalAiDraftContext, encounter: Encounter) {
  const anchorsMatch = context.encounterId === encounter.id && context.residentId === encounter.residentId
    && request.encounterId === context.encounterId && request.residentId === context.residentId
  if (!anchorsMatch) throw new Error('当前患者或就诊已切换，系统已拒绝带入旧建议。')
  if (!canApplyClinicalAiSuggestion(suggestion, context)) {
    throw new Error('当前草稿与建议生成时已经不同，请重新分析后再带入。')
  }
}

async function canonicalizeActiveDiagnoses(api: RhnApi, values: DiagnosisInput[]) {
  const unique = [...new Map(values.map((value) => [value.code.trim().toUpperCase(), value])).values()]
  return Promise.all(unique.map(async (value): Promise<DiagnosisInput> => {
    const code = value.code.trim()
    if (!code) throw new Error('AI 返回了空诊断编码，系统已拒绝带入。')
    const concepts = await api.masterData.diseases(code, '', 'ACTIVE')
    const exact = concepts.find((item) => item.sdStatus === 'ACTIVE' && item.systemCode === 'WHO.BD.CS.ICD10'
      && item.code.trim().toUpperCase() === code.toUpperCase())
    if (!exact) throw new Error(`诊断编码 ${code} 未通过院内有效术语目录复核，系统已拒绝带入。`)
    return { code: exact.code.trim(), display: exact.display.trim(), type: value.type }
  }))
}

function adoptionCommand(commands: Map<string, string>, suggestionId: string, sectionCode: string) {
  const key = `${suggestionId}:${sectionCode}`
  const existing = commands.get(key)
  if (existing) return existing
  const created = `AI-ADOPTED-${suggestionId}-${globalThis.crypto.randomUUID()}`
  commands.set(key, created)
  return created
}

function eventInput(suggestion: ClinicalAiSuggestion, eventType: ClinicalAiSuggestionEventType,
  sectionCode: string, commandCode?: string) {
  return { commandCode: commandCode ?? `AI-${eventType}-${suggestion.id}-${globalThis.crypto.randomUUID()}`,
    eventType, sectionCode, contextHash: suggestion.contextHash }
}

function recordEvent(api: RhnApi, suggestion: ClinicalAiSuggestion,
  eventType: ClinicalAiSuggestionEventType, sectionCode: string) {
  return api.clinicalAi.recordEvent(suggestion.id, eventInput(suggestion, eventType, sectionCode)).catch(() => undefined)
}
