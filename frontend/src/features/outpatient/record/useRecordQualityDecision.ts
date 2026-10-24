import { useEffect, useRef, useState } from 'react'
import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { RecordQualityFeedback, RecordQualityFeedbackRequest, RecordQualityResult } from '../../../shared/api/clinicalAiApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import type { ClinicalDraftSession } from './useClinicalDraftSession'
import { useClinicalDocumentSession } from './useClinicalDocumentSession'
import type { RecordForm } from './clinicalRecordDraft'

export const recordQualityFields = ['chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
  'allergyHistory', 'medicationHistory', 'auxiliaryExaminations', 'healthEducation', 'followUp'] as const
export function recordQualityInput(form: RecordForm): Record<string, string> {
  return Object.fromEntries(recordQualityFields.map(field => [field, form[field] ?? '']))
}
export function latestFindingFeedback(feedback: RecordQualityFeedback[] = []) {
  return new Map(feedback.map(value => [value.findingCode, value]))
}

export function useRecordQualityDecision(api: RhnApi, encounterId: string, identity: string, enabled: boolean,
  getValues: () => RecordForm, captureDraft: () => ClinicalDraftSession) {
  const capture = useClinicalDocumentSession(api, identity, enabled)
  const [state, setState] = useState<{ api: RhnApi; identity: string; result: RecordQualityResult | null } | null>(null)
  const assessment = state?.api === api && state.identity === identity ? state.result : null
  const setAssessment = (value: RecordQualityResult | null | ((current: RecordQualityResult | null) => RecordQualityResult | null)) => {
    setState(previous => ({ api, identity, result: typeof value === 'function'
      ? value(previous?.api === api && previous.identity === identity ? previous.result : null) : value }))
  }
  const captureRef = useRef(capture)
  captureRef.current = capture
  const sequence = useRef(0)
  const [source, setSource] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  const pending = useRef<{ runId: string; request: RecordQualityFeedbackRequest } | null>(null)
  const latest = latestFindingFeedback(assessment?.feedback)
  const pendingAdoption = [...latest.values()].some(value => value.action === 'ADOPTED')
  const hasContent = Object.values(recordQualityInput(getValues())).some(value => value.trim().length > 0)
  const stale = source === null || source !== JSON.stringify(recordQualityInput(getValues()))
  useEffect(() => {
    setState(null); setSource(null); setError(''); setBusy(false); pending.current = null
    if (!enabled || !api.clinicalAi.latestRecordQuality) return
    const assertCurrent = captureRef.current()
    const generation = ++sequence.current
    let active = true
    void api.clinicalAi.latestRecordQuality(encounterId).then(result => {
      assertCurrent()
      if (active && generation === sequence.current) setState({ api, identity, result })
    }).catch(() => { /* A previous result is optional; explicit assessment still reports errors. */ })
    return () => { active = false }
  }, [api, encounterId, identity, enabled])

  async function assess() {
    if (inFlight.current || !enabled || pendingAdoption || pending.current) return
    const fields = recordQualityInput(getValues())
    if (!Object.values(fields).some(value => value.trim().length > 0)) return
    const session = captureDraft(), assertCurrent = capture()
    sequence.current += 1
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await api.clinicalAi.assessRecordQuality(encounterId, fields)
      session.assertUnchanged(); assertCurrent()
      setAssessment(result); setSource(JSON.stringify(fields))
    } catch (failure) {
      if (session.isCurrent()) {
        setError(errorMessage(failure))
        if (typeof failure === 'object' && failure !== null && 'code' in failure && failure.code === 'RECORD_QUALITY_FEEDBACK_PENDING') {
          try {
            const previous = await api.clinicalAi.latestRecordQuality(encounterId)
            assertCurrent(); setAssessment(previous); setSource(null)
          } catch { /* Preserve the explicit error; the next session can restore persisted adoption. */ }
        }
      }
    }
    finally { inFlight.current = false; if (session.isCurrent()) setBusy(false) }
  }

  async function send(runId: string, request: RecordQualityFeedbackRequest) {
    if (inFlight.current || !enabled) return false
    const assertCurrent = capture()
    pending.current = { runId, request }
    inFlight.current = true; setBusy(true); setError('')
    try {
      assertCurrent()
      const feedback = await api.clinicalAi.recordQualityFeedback(encounterId, runId, request)
      assertCurrent()
      setAssessment(current => current?.runId !== runId ? current : { ...current,
        feedback: [...new Map([...(current.feedback ?? []), ...feedback].map(value => [value.id, value])).values()] })
      pending.current = null
      return true
    } catch (failure) {
      try {
        assertCurrent()
        const code = typeof failure === 'object' && failure !== null && 'code' in failure ? failure.code : undefined
        if (code === 'RECORD_QUALITY_SAVE_VERSION' || code === 'RECORD_QUALITY_SAVE_BEFORE_ADOPTION'
          || code === 'RECORD_QUALITY_ADOPTION_DISABLED' || code === 'RECORD_QUALITY_NO_ADOPTION') pending.current = null
        setError(`病历核查反馈未确认：${errorMessage(failure)}。请核实后重试；已保存病历保持有效。`)
      } catch { /* stale session */ }
      return false
    } finally {
      inFlight.current = false
      try { assertCurrent(); setBusy(false) } catch { /* stale session */ }
    }
  }
  async function act(code: string, action: 'ADOPTED' | 'DISMISSED') {
    if (!assessment?.runId || pending.current || (action === 'ADOPTED' && stale)) return false
    return send(assessment.runId, { commandCode: crypto.randomUUID(), action, findingCode: code })
  }
  async function confirmSaved(document: ClinicalDocument) {
    if (!assessment?.runId || !pendingAdoption || pending.current) return false
    return send(assessment.runId, { commandCode: `record-quality:${assessment.runId}:${document.id}:${document.currentVersion}`,
      action: 'SAVED', documentId: document.id, documentVersion: document.currentVersion })
  }
  return { assessment, latest, busy, error, stale, hasContent, pendingAdoption, assess, act, confirmSaved,
    retryPending: Boolean(pending.current),
    retry: () => pending.current ? send(pending.current.runId, pending.current.request) : Promise.resolve(false) }
}
