import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClinicalAiDraftContext, ClinicalAiPlanPreflight, ClinicalAiRecommendedPlan, ClinicalAiSuggestion,
  ClinicalAiSuggestionEventType,
} from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, StatusBadge, Tabs } from '../../../shared/ui'
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
  selectedPlanTemplate?: OutpatientPlanTemplate
  closePlan?: boolean
  eventDetail?: string
  allergyReviewConfirmed?: boolean
  allergyOverrideReason?: string
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
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [suggestionVoiceTranscript, setSuggestionVoiceTranscript] = useState('')
  const [recording, setRecording] = useState(false)
  const [currentSuggestion, setCurrentSuggestion] = useState<ClinicalAiSuggestion | null>(null)
  const [viewMode, setViewMode] = useState<'current' | 'history'>('current')
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<ClinicalAiRecommendedPlan | null>(null)
  const viewed = useRef(new Set<string>())
  const adoptionCommands = useRef(new Map<string, string>())
  const latestContext = useRef(currentContext)
  const latestAllergyState = useRef(allergyState)
  const recorder = useRef<MediaRecorder | null>(null)
  const recordingStream = useRef<MediaStream | null>(null)
  const recordingChunks = useRef<Blob[]>([])
  const discardRecording = useRef(false)
  latestContext.current = currentContext
  latestAllergyState.current = allergyState
  const scopeKey = [encounter.organizationId, encounter.departmentId, encounter.clinicianId ?? 'UNASSIGNED']
  const historyQueryKey = ['clinical-ai-suggestion-history', encounter.id, ...scopeKey]
  const capabilities = useQuery({ queryKey: ['clinical-ai-capabilities', ...scopeKey], queryFn: api.clinicalAi.capabilities,
    staleTime: 5 * 60 * 1000, retry: false })
  const history = useQuery({ queryKey: historyQueryKey, queryFn: () => api.clinicalAi.history(encounter.id),
    enabled: Boolean(capabilities.data?.available && capabilities.data.mode !== 'DISABLED'), retry: false })
  const historicalSuggestion = history.data?.find((item) => item.id === selectedHistoryId)
    ?? history.data?.[0] ?? null
  const historicalView = viewMode === 'history'
  const suggestion = historicalView ? historicalSuggestion : currentSuggestion
  const templates = useQuery({
    queryKey: ['outpatient-plan-templates', 'ai-assistant', ...scopeKey],
    queryFn: () => api.outpatientPlanTemplates.list(),
    enabled: Boolean(!historicalView && suggestion?.recommendedPlans.length
      && capabilities.data?.features.includes('PLAN_RECOMMENDATIONS')),
  })
  const transcribe = useMutation({
    mutationFn: (audio: Blob) => api.clinicalAi.transcribe(encounter.id, audio),
    onSuccess: (value) => {
      setVoiceTranscript(value.text)
      setCurrentSuggestion(null)
      setSuggestionVoiceTranscript('')
      setLocalError('')
    },
  })
  const generate = useMutation({
    mutationFn: ({ parentSuggestionId }: { parentSuggestionId?: string }) => {
      const context = latestContext.current
      if (disabled || context.busy || context.encounterId !== encounter.id
        || context.residentId !== encounter.residentId) {
        throw new Error('当前就诊上下文正在变化，请稍后再分析。')
      }
      return api.clinicalAi.generate(encounter.id, {
        clientContextFingerprint: clinicalAiContextFingerprint(context),
        question: question.trim() || undefined,
        voiceTranscript: voiceTranscript.trim() || undefined,
        draft: clinicalAiDraftInput(context),
        parentSuggestionId,
      })
    },
    onSuccess: (value) => {
      setCurrentSuggestion(value); setViewMode('current'); setSuggestionVoiceTranscript(voiceTranscript.trim())
      setQuestion(''); setLocalError('')
      queryClient.setQueryData<ClinicalAiSuggestion[]>(historyQueryKey, (current) => [
        value, ...(current ?? []).filter((item) => item.id !== value.id),
      ].slice(0, 50))
    },
  })
  const knowledgeSearch = useMutation({
    mutationFn: () => api.clinicalAi.searchKnowledge(encounter.id, knowledgeQuery.trim()),
    onSuccess: () => setLocalError(''),
  })
  const adoptDraft = useMutation({
    mutationFn: async (value: AiAdoptionIntent) => {
      requireCurrentAdoption(value.suggestion, value.request, latestContext.current, encounter)
      let request = value.request
      if (request.diagnoses?.length) {
        request = { ...request, diagnoses: await canonicalizeActiveDiagnoses(api, request.diagnoses) }
      }
      if (value.planTemplateId) {
        const planTemplateId = value.planTemplateId
        if (latestAllergyState.current !== 'READY' || latestContext.current.allergyState !== 'READY') {
          throw new Error('患者过敏信息尚未就绪，不能带入诊疗方案。')
        }
        const selected = value.selectedPlanTemplate
        const selectedMedicationLineIds = selected?.medications.map((item) => item.lineId) ?? []
        if (selectedMedicationLineIds.length) {
          const preflight = await api.clinicalAi.preflightPlan(encounter.id, planTemplateId, {
            selectedMedicationLineIds,
            allergyReviewConfirmed: Boolean(value.allergyReviewConfirmed),
            allergyOverrideReason: value.allergyOverrideReason,
          })
          if (preflight.status === 'BLOCKED') {
            throw new Error(`方案预检未通过，仍有 ${preflight.blockingCount} 项阻断问题。`)
          }
          if (selected && preflight.templateRevision !== selected.revision) {
            throw new Error('院内方案在核对期间发生变化，请重新分析。')
          }
          value = { ...value, eventDetail: appendPreflightDetail(value.eventDetail, preflight) }
        }
        const currentTemplate = await api.outpatientPlanTemplates.use(planTemplateId)
        if (latestAllergyState.current !== 'READY') {
          throw new Error('患者过敏信息在方案核对期间发生刷新，不能带入诊疗方案。')
        }
        const selectedDiagnosisKeys = new Set(selected?.diagnoses.map(planDiagnosisKey))
        const selectedMedicationKeys = new Set(selected?.medications.map(planMedicationKey))
        const selectedServiceKeys = new Set(selected?.services.map(planServiceKey))
        const planTemplate = selected ? {
          ...currentTemplate,
          diagnoses: currentTemplate.diagnoses.filter((item) => selectedDiagnosisKeys.has(planDiagnosisKey(item))),
          medications: currentTemplate.medications.filter((item) => selectedMedicationKeys.has(planMedicationKey(item))),
          services: currentTemplate.services.filter((item) => selectedServiceKeys.has(planServiceKey(item))),
        } : currentTemplate
        if (selected && (planTemplate.diagnoses.length !== selected.diagnoses.length
          || planTemplate.medications.length !== selected.medications.length
          || planTemplate.services.length !== selected.services.length)) {
          throw new Error('院内方案条目在核对期间发生变化，请重新分析。')
        }
        const planDiagnoses = await canonicalizeActiveDiagnoses(api, planTemplate.diagnoses)
        request = { ...request, planTemplate: { ...planTemplate, diagnoses: planDiagnoses } }
      }
      requireCurrentAdoption(value.suggestion, request, latestContext.current, encounter)
      await api.clinicalAi.recordEvent(value.suggestion.id,
        eventInput(value.suggestion, 'ADOPTED', value.sectionCode, value.commandCode, value.eventDetail))
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
    onSuccess: () => {
      setCurrentSuggestion(null); setLocalError('')
      void queryClient.invalidateQueries({ queryKey: historyQueryKey })
    },
  })
  const actionPending = recording || transcribe.isPending || generate.isPending
    || adoptDraft.isPending || ignoreSuggestion.isPending
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
  useEffect(() => () => {
    discardRecording.current = true
    const currentRecorder = recorder.current
    if (currentRecorder && currentRecorder.state !== 'inactive') {
      currentRecorder.onstop = null
      currentRecorder.stop()
    }
    recordingStream.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const current = !historicalView && suggestion ? canApplyClinicalAiSuggestion(suggestion, currentContext)
    && voiceTranscript.trim() === suggestionVoiceTranscript : false
  const capabilityError = capabilities.error
  const error = transcribe.error || generate.error || knowledgeSearch.error || templates.error
    || adoptDraft.error || ignoreSuggestion.error

  useEffect(() => {
    setCurrentSuggestion(null)
    setSelectedHistoryId(null)
    setViewMode('current')
    setSelectedPlan(null)
    setSuggestionVoiceTranscript('')
  }, [encounter.id])

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setLocalError('当前浏览器不支持录音，请改用文字输入。')
      return
    }
    try {
      discardRecording.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm'
      const value = new MediaRecorder(stream, { mimeType })
      recordingStream.current = stream
      recordingChunks.current = []
      recorder.current = value
      value.ondataavailable = (event) => { if (event.data.size > 0) recordingChunks.current.push(event.data) }
      value.onstop = () => {
        setRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        recordingStream.current = null
        if (discardRecording.current) return
        const audio = new Blob(recordingChunks.current, { type: value.mimeType || 'audio/webm' })
        recordingChunks.current = []
        if (audio.size === 0) { setLocalError('未录到有效声音，请重新录制。'); return }
        transcribe.mutate(audio)
      }
      value.start()
      setRecording(true)
      setLocalError('')
    } catch {
      recordingStream.current?.getTracks().forEach((track) => track.stop())
      recordingStream.current = null
      setRecording(false)
      setLocalError('无法使用麦克风，请检查浏览器权限或改用文字输入。')
    }
  }

  const stopRecording = () => {
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

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
    if (!suggestion || !current
      || !guardCurrent(suggestion, latestContext.current, setLocalError, undefined, encounter)) {
      if (suggestion && !current) setLocalError('当前语音转写或就诊草稿已变化，请重新分析后再带入。')
      return
    }
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
    <Tabs value={viewMode} label="智医助理视图" className="doctor-ai-assistant__tabs" items={[
      { value: 'current', label: '当前建议' },
      { value: 'history', label: '历史记录', meta: history.data?.length ? `${history.data.length}` : undefined },
    ]} onChange={(value) => {
      setViewMode(value); setSelectedPlan(null); setLocalError('')
      if (value === 'history' && !selectedHistoryId) setSelectedHistoryId(history.data?.[0]?.id ?? null)
    }} />
    {!historicalView && <>
    <section className="doctor-ai-assistant__prompt">
      {capability.features.includes('VOICE_TRANSCRIPTION') && <div className="doctor-ai-assistant__voice">
        <div className="doctor-ai-assistant__voice-head"><div><strong>语音转写草稿</strong>
          <small>{recording ? '正在录音' : transcribe.isPending ? '正在转写' : '录音停止后转写，可编辑后再分析'}</small></div>
          {recording
            ? <Button size="sm" variant="secondary" onClick={stopRecording}>停止录音</Button>
            : <Button size="sm" variant="secondary" disabled={actionPending}
              onClick={() => void startRecording()}>开始录音</Button>}
        </div>
        {voiceTranscript && <FormField label="转写文本（可编辑）"><textarea value={voiceTranscript}
          maxLength={10000} disabled={actionPending} onChange={(event) => setVoiceTranscript(event.target.value)} /></FormField>}
      </div>}
      <FormField label="本次希望重点辅助什么"><textarea value={question} maxLength={500} disabled={actionPending}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="例如：补全病历要点、检查诊断遗漏、推荐已有诊疗方案（可不填）" /></FormField>
      <div className="doctor-ai-assistant__quick-prompts" aria-label="快捷辅助方向">
        {['补全病历要点', '检查危险信号', '核对诊断遗漏',
          ...(capability.features.includes('REPORT_INTERPRETATION') ? ['解读检查报告'] : []),
          ...(capability.features.includes('CLINICAL_FOLLOW_UP') ? ['生成补充问诊'] : []),
          ...(capability.features.includes('FACT_CHECK') ? ['核查病历与报告一致性'] : []),
          ...(capability.features.includes('DIAGNOSIS_REASONING') ? ['梳理鉴别诊断依据'] : []),
          ...(capability.features.includes('LONGITUDINAL_HISTORY') ? ['核对慢病复诊与既往用药'] : []),
        ].map((value) => <button type="button" key={value}
          disabled={actionPending} onClick={() => setQuestion(value)}>{value}</button>)}
      </div>
      <div className="doctor-ai-assistant__prompt-actions">
        {capability.features.includes('CONVERSATION_FOLLOW_UP') && suggestion && <Button variant="secondary"
          busy={generate.isPending} disabled={disabled || actionPending || !current || !question.trim()}
          onClick={() => generate.mutate({ parentSuggestionId: suggestion.id })}>基于本结果追问</Button>}
        <Button busy={generate.isPending} disabled={disabled || actionPending}
          onClick={() => generate.mutate({})}><Icon name="sparkles" />分析当前就诊</Button>
      </div>
    </section>
    {capability.features.includes('KNOWLEDGE_RETRIEVAL') && <section className="doctor-ai-assistant__knowledge">
      <header><div><strong>循证知识检索</strong><small>仅展示带来源的院方知识服务结果</small></div></header>
      <div className="doctor-ai-assistant__knowledge-search">
        <input value={knowledgeQuery} maxLength={500} disabled={knowledgeSearch.isPending}
          onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="疾病、药品或检查名称"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && knowledgeQuery.trim()) knowledgeSearch.mutate()
          }} />
        <Button size="sm" variant="secondary" busy={knowledgeSearch.isPending}
          disabled={!knowledgeQuery.trim()} onClick={() => knowledgeSearch.mutate()}>
          <Icon name="search" />检索
        </Button>
      </div>
      {knowledgeSearch.data && <div className="doctor-ai-assistant__knowledge-results">
        {knowledgeSearch.data.results.length > 0 ? knowledgeSearch.data.results.map((item) => <article key={item.id}>
          <div className="doctor-ai-assistant__knowledge-title"><strong>{item.title}</strong>
            {item.score !== undefined && <StatusBadge tone="neutral">相关度 {Math.round(item.score * 100)}%</StatusBadge>}
          </div>
          {item.excerpt && <p>{item.excerpt}</p>}
          <small>来源：{item.sourceName}{item.publishYear ? ` · ${item.publishYear}` : ''}
            {item.resourcePosition ? ` · ${item.resourcePosition}` : ''}</small>
        </article>) : <EmptyState icon="search" title="未找到可信结果" copy="请调整疾病、药品或检查关键词后重试。" />}
      </div>}
    </section>}
    </>}
    {historicalView && <SuggestionHistory history={history.data ?? []} selectedId={suggestion?.id}
      pending={history.isPending} error={history.error} onSelect={setSelectedHistoryId} />}
    {!auditFeature && <Alert>当前 AI 能力未声明审计留痕支持，因此仅展示建议，不允许带入草稿。</Alert>}
    {!historicalView && (error || localError) && <Alert>{localError || errorMessage(error)}</Alert>}
    {suggestion ? <>
      {historicalView
        ? <Alert>历史建议为生成时的不可变记录，仅供追溯；请回到“当前建议”重新分析后再带入。</Alert>
        : !current && <Alert>当前草稿已变化或建议已经过期。为避免串写，请重新分析后再带入。</Alert>}
      <SuggestionResult suggestion={suggestion} recordEntries={recordEntries}
        showMissing={recordFeature} showSafety={safetyFeature} showDiagnoses={diagnosisFeature} />
      {!historicalView && (recordFeature || diagnosisFeature) && <div className="doctor-ai-assistant__actions">
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
          {historicalView ? <StatusBadge tone="neutral">历史记录</StatusBadge>
            : <Button size="sm" variant="secondary" disabled={disabled || actionPending || !current
              || !auditFeature || templates.isPending}
              onClick={() => setSelectedPlan(plan)}>核对后带入</Button>}
        </article>)}
      </section>}
      <footer className="doctor-ai-assistant__disclaimer">{suggestion.disclaimer}</footer>
      <div className="doctor-ai-assistant__provenance">生成来源：{suggestion.provider}
        {suggestion.model ? ` / ${suggestion.model}` : ''} · {suggestion.promptVersion}</div>
      {auditFeature && !historicalView && <div className="doctor-ai-assistant__feedback"><span>这次建议是否有帮助？</span>
        <Button size="sm" variant="text" disabled={actionPending}
          onClick={() => void recordEvent(api, suggestion, 'FEEDBACK_POSITIVE', 'RESULT')}>有帮助</Button>
        <Button size="sm" variant="text" disabled={actionPending}
          onClick={() => void recordEvent(api, suggestion, 'FEEDBACK_NEGATIVE', 'RESULT')}>需改进</Button>
      </div>}
    </> : !historicalView ? <EmptyState icon="clinical" title="尚未生成本次建议"
      copy="助理会基于当前就诊和院内可用数据查漏补缺，结果由你决定是否带入草稿。" /> : null}
    {!historicalView && selectedPlan && <AiPlanReviewDialog recommendation={selectedPlan} api={api} encounterId={encounter.id}
      template={templates.data?.find((value) => value.id === selectedPlan.templateId)}
      allergies={allergies} allergyState={allergyState} suggestion={suggestion!}
      recordAvailable={recordEntries.length > 0} diagnosisAvailable={diagnosisDrafts.length > 0}
      disabled={disabled || !current || !auditFeature} busy={adoptDraft.isPending} error={adoptDraft.error}
      onClose={() => setSelectedPlan(null)} onApply={(template, safetyConfirmed, overrideReason, includeClinicalDraft,
        eventDetail) => {
        if (!guardCurrent(suggestion!, latestContext.current, setLocalError, undefined, encounter)) return
        const context = latestContext.current
        const sectionCode = includeClinicalDraft ? 'ALL' : `PLAN:${template.id}`
        adoptDraft.mutate({ suggestion: suggestion!, planTemplateId: template.id,
          selectedPlanTemplate: template, closePlan: true,
          eventDetail,
          allergyReviewConfirmed: safetyConfirmed, allergyOverrideReason: overrideReason || undefined,
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

function SuggestionHistory({ history, selectedId, pending, error, onSelect }: {
  history: ClinicalAiSuggestion[]
  selectedId?: string
  pending: boolean
  error: unknown
  onSelect: (id: string) => void
}) {
  if (pending) return <section className="doctor-ai-assistant__history"><LoadingState label="正在加载建议历史…" /></section>
  if (error) return <section className="doctor-ai-assistant__history">
    <Alert>建议历史加载失败：{errorMessage(error)}</Alert>
  </section>
  if (history.length === 0) return <section className="doctor-ai-assistant__history">
    <EmptyState icon="clinical" title="暂无历史建议" copy="本次就诊生成过的建议会按时间保留在这里。" />
  </section>
  return <section className="doctor-ai-assistant__history" aria-label="AI 建议历史">
    <header><strong>最近建议</strong><small>最近 50 条 · 新生成在前</small></header>
    <div className="doctor-ai-assistant__history-list" role="list">
      {history.map((item) => {
        const status = suggestionStatusPresentation(item.status)
        return <div role="listitem" key={item.id}><button type="button"
          className={item.id === selectedId ? 'is-active' : ''} aria-pressed={item.id === selectedId}
          onClick={() => onSelect(item.id)}>
          <span className="doctor-ai-assistant__history-row">
            <strong>{item.summary || '无摘要'}</strong><StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </span>
          <small>{formatSuggestionTime(item.generatedAt)} · {item.provider}{item.model ? ` / ${item.model}` : ''}
            {item.parentSuggestionId ? ` · 追问自 #${item.parentSuggestionId}` : ''}</small>
        </button></div>
      })}
    </div>
  </section>
}

function suggestionStatusPresentation(status: ClinicalAiSuggestion['status']) {
  return ({
    GENERATED: { label: '待核对', tone: 'info' },
    PARTIALLY_ADOPTED: { label: '部分采纳', tone: 'warning' },
    ADOPTED: { label: '已采纳', tone: 'success' },
    IGNORED: { label: '已忽略', tone: 'neutral' },
    EXPIRED: { label: '已过期', tone: 'neutral' },
    FAILED: { label: '生成失败', tone: 'danger' },
  } as const)[status]
}

function formatSuggestionTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
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

function AiPlanReviewDialog({ recommendation, template, allergies, allergyState, suggestion, api, encounterId,
  recordAvailable, diagnosisAvailable, disabled, busy, error, onClose, onApply }: {
  recommendation: ClinicalAiRecommendedPlan
  api: RhnApi
  encounterId: string
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
    includeClinicalDraft: boolean, eventDetail: string) => void
}) {
  const [safetyConfirmed, setSafetyConfirmed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [includeClinicalDraft, setIncludeClinicalDraft] = useState(recordAvailable || diagnosisAvailable)
  const [selectedDiagnoses, setSelectedDiagnoses] = useState<Set<string>>(new Set())
  const [selectedMedications, setSelectedMedications] = useState<Set<string>>(new Set())
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set())
  useEffect(() => {
    setSelectedDiagnoses(new Set(template?.diagnoses.map(planDiagnosisKey) ?? []))
    setSelectedMedications(new Set(template?.medications.map(planMedicationKey) ?? []))
    setSelectedServices(new Set(template?.services.map(planServiceKey) ?? []))
    setSafetyConfirmed(false)
    setOverrideReason('')
  }, [template?.id, template?.revision])
  const selectedTemplate = template && {
    ...template,
    diagnoses: template.diagnoses.filter((item) => selectedDiagnoses.has(planDiagnosisKey(item))),
    medications: template.medications.filter((item) => selectedMedications.has(planMedicationKey(item))),
    services: template.services.filter((item) => selectedServices.has(planServiceKey(item))),
  }
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const matched = useMemo(() => selectedTemplate?.medications.flatMap((medication) => drugAllergies.filter((allergy) =>
    allergy.substanceCode?.toLowerCase() === medication.medicationCode.toLowerCase())) ?? [],
  [drugAllergies, selectedTemplate])
  const containsMedication = Boolean(selectedTemplate?.medications.length)
  const selectedMedicationLineIds = useMemo(() => selectedTemplate?.medications
    .map((item) => item.lineId).sort() ?? [], [selectedTemplate])
  const preflight = useQuery({
    queryKey: ['clinical-ai-plan-preflight', encounterId, template?.id, selectedMedicationLineIds.join(','),
      safetyConfirmed, Boolean(overrideReason.trim())],
    queryFn: () => api.clinicalAi.preflightPlan(encounterId, template!.id, {
      selectedMedicationLineIds,
      allergyReviewConfirmed: safetyConfirmed,
      allergyOverrideReason: overrideReason.trim() || undefined,
    }),
    enabled: Boolean(template && selectedMedicationLineIds.length),
    retry: false,
  })
  const selectedItemCount = (selectedTemplate?.diagnoses.length ?? 0) + (selectedTemplate?.medications.length ?? 0)
    + (selectedTemplate?.services.length ?? 0)
  const allergyReady = allergyState === 'READY'
  return <Dialog title={`核对“${recommendation.name}”`} eyebrow="智医助理 · 既有诊疗方案"
    description="AI 只负责推荐。系统将在你核对后把院内已维护方案加入待确认草稿，不会直接开立。"
    closeOnBackdrop={false} onClose={() => !busy && onClose()} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button busy={busy} disabled={disabled || busy || !selectedTemplate || !allergyReady
        || selectedItemCount === 0 && !includeClinicalDraft || containsMedication
        && (!safetyConfirmed || matched.length > 0 && !overrideReason.trim()
          || preflight.isPending || Boolean(preflight.error) || preflight.data?.status === 'BLOCKED')}
        onClick={() => onApply(selectedTemplate!, safetyConfirmed, overrideReason.trim(), includeClinicalDraft,
          planSelectionDetail(selectedTemplate!))}>
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
      <PlanItemReview template={template} selectedDiagnoses={selectedDiagnoses}
        selectedMedications={selectedMedications} selectedServices={selectedServices}
        onToggleDiagnosis={(key) => setSelectedDiagnoses((current) => toggled(current, key))}
        onToggleMedication={(key) => {
          setSelectedMedications((current) => toggled(current, key)); setSafetyConfirmed(false); setOverrideReason('')
        }}
        onToggleService={(key) => setSelectedServices((current) => toggled(current, key))} />
      {containsMedication && <PlanPreflightReview preflight={preflight.data}
        pending={preflight.isPending} error={preflight.error} />}
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

function PlanItemReview({ template, selectedDiagnoses, selectedMedications, selectedServices,
  onToggleDiagnosis, onToggleMedication, onToggleService }: {
  template: OutpatientPlanTemplate
  selectedDiagnoses: Set<string>
  selectedMedications: Set<string>
  selectedServices: Set<string>
  onToggleDiagnosis: (key: string) => void
  onToggleMedication: (key: string) => void
  onToggleService: (key: string) => void
}) {
  const groups = [
    { key: 'diagnoses', label: '诊断', items: template.diagnoses.map((item) => ({
      id: planDiagnosisKey(item), name: item.display,
      detail: `${item.code} · ${item.type === 'PRIMARY' ? '主要诊断' : '次要诊断'}`,
      selected: selectedDiagnoses.has(planDiagnosisKey(item)), onToggle: onToggleDiagnosis,
    })) },
    { key: 'medications', label: '药品', items: template.medications.map((item) => ({
      id: planMedicationKey(item),
      name: item.productName || item.medicationName,
      detail: [item.preparationSpec, item.doseValue && `${item.doseValue}${item.doseUnit || ''}`,
        item.routeName || item.routeCode, item.frequencyCode,
        item.durationValue && `${item.durationValue}${item.durationUnit || ''}`,
        `${item.quantity}${item.quantityUnit || ''}`].filter(Boolean).join(' · '),
      selected: selectedMedications.has(planMedicationKey(item)), onToggle: onToggleMedication,
    })) },
    ...(['LABORATORY', 'EXAMINATION', 'TREATMENT', 'OTHER'] as const).map((serviceType) => ({
      key: serviceType,
      label: ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '处置', OTHER: '其他项目' })[serviceType],
      items: template.services.filter((item) => item.serviceType === serviceType).map((item) => ({
        id: `${item.catalogItemId}:${item.itemCode}`, name: item.itemName,
        detail: [item.itemCode, `${item.quantity}${item.unitCode || ''}`, item.clinicalDescription, item.reason]
          .filter(Boolean).join(' · '),
        selected: selectedServices.has(planServiceKey(item)), onToggle: onToggleService,
      })),
    })),
  ].filter((group) => group.items.length > 0)

  return <div className="doctor-ai-assistant__plan-items" aria-label="方案结构化条目">
    {groups.map((group) => <section key={group.key}>
      <header><strong>{group.label}</strong><small>{group.items.length} 项</small></header>
      {group.items.map((item) => <label className="doctor-ai-assistant__plan-item" key={item.id}>
        <input type="checkbox" checked={item.selected} onChange={() => item.onToggle(item.id)} />
        <span><strong>{item.name}</strong><small>{item.detail || '具体属性待在医嘱草稿中核对'}</small></span>
      </label>)}
    </section>)}
  </div>
}

function PlanPreflightReview({ preflight, pending, error }: {
  preflight?: ClinicalAiPlanPreflight
  pending: boolean
  error: unknown
}) {
  if (pending) return <div className="doctor-ai-assistant__preflight"><LoadingState label="正在核对目录、用法、过敏与路由药房库存…" /></div>
  if (error) return <div className="doctor-ai-assistant__preflight"><Alert>{errorMessage(error)}</Alert></div>
  if (!preflight) return null
  const tone = preflight.status === 'BLOCKED' ? 'danger' : preflight.status === 'WARNING' ? 'warning' : 'success'
  const label = preflight.status === 'BLOCKED' ? `${preflight.blockingCount} 项阻断`
    : preflight.status === 'WARNING' ? `${preflight.warningCount} 项需留意` : '确定性检查通过'
  return <section className="doctor-ai-assistant__preflight" aria-label="方案用药预检">
    <header><div><strong>用药预检</strong><small>结果仅用于采纳前核对，正式开立与提交仍会再次校验</small></div>
      <StatusBadge tone={tone}>{label}</StatusBadge></header>
    <div className="doctor-ai-assistant__preflight-grid">
      {preflight.medications.map((medication) => <article key={medication.lineId}>
        <header><strong>{medication.productName || medication.medicationName}</strong>
          <StatusBadge tone={medication.status === 'BLOCKED' ? 'danger'
            : medication.status === 'WARNING' ? 'warning' : 'success'}>
            {medication.status === 'BLOCKED' ? '阻断' : medication.status === 'WARNING' ? '提醒' : '通过'}
          </StatusBadge></header>
        <ul>{medication.checks.map((check) => <li className={`is-${check.status.toLowerCase()}`}
          key={check.code}><span>{preflightCheckLabel(check.code)}</span><small>{check.message}</small></li>)}</ul>
      </article>)}
    </div>
    <div className="doctor-ai-assistant__evaluation-boundary">
      <strong>尚未评估</strong>
      <span>{preflight.drugInteractions.message}</span>
      <span>{preflight.contraindications.message}</span>
    </div>
  </section>
}

function preflightCheckLabel(code: string) {
  return ({ PRODUCT_PACKAGE: '产品 / 包装', DOSE: '单次剂量', ROUTE: '给药途径', FREQUENCY: '用药频次',
    DURATION: '疗程', QUANTITY: '申请数量', INVENTORY: '药房库存', ALLERGY_MATCH: '药物过敏',
    ALLERGY_REVIEW: '过敏核对' } as Record<string, string>)[code] ?? code
}

function planDiagnosisKey(item: OutpatientPlanTemplate['diagnoses'][number]) {
  return `${item.type}:${item.code}`
}

function planMedicationKey(item: OutpatientPlanTemplate['medications'][number]) {
  return item.lineId
}

function planServiceKey(item: OutpatientPlanTemplate['services'][number]) {
  return [item.catalogItemId, item.itemCode, item.quantity, item.unitCode, item.reason,
    item.clinicalDescription].map((value) => value ?? '').join(':')
}

function toggled(current: Set<string>, key: string) {
  const next = new Set(current)
  if (next.has(key)) next.delete(key); else next.add(key)
  return next
}

function planSelectionDetail(template: OutpatientPlanTemplate) {
  return JSON.stringify({ templateId: template.id, diagnoses: template.diagnoses.map((item) => item.code),
    medications: template.medications.map((item) => item.catalogItemId || `MED:${item.medicationId}`),
    services: template.services.map((item) => item.catalogItemId) }).slice(0, 1000)
}

function appendPreflightDetail(detail: string | undefined,
  preflight: ClinicalAiPlanPreflight) {
  const marker = JSON.stringify({ planPreflight: { status: preflight.status,
    blockingCount: preflight.blockingCount, warningCount: preflight.warningCount,
    checkedAt: preflight.checkedAt } })
  return [marker, detail].filter(Boolean).join(' ').slice(0, 1000)
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
  sectionCode: string, commandCode?: string, detail?: string) {
  return { commandCode: commandCode ?? `AI-${eventType}-${suggestion.id}-${globalThis.crypto.randomUUID()}`,
    eventType, sectionCode, contextHash: suggestion.contextHash, detail }
}

function recordEvent(api: RhnApi, suggestion: ClinicalAiSuggestion,
  eventType: ClinicalAiSuggestionEventType, sectionCode: string) {
  return api.clinicalAi.recordEvent(suggestion.id, eventInput(suggestion, eventType, sectionCode)).catch(() => undefined)
}
