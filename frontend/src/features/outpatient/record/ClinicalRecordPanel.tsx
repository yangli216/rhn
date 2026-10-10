import { AnnotatedRecordField } from "./AnnotatedRecordField";
import { RecordAnnotationLegend } from "./RecordAnnotationLegend";
import { rebaseAnnotations } from "./recordAnnotations";
import type { RecordTextField } from "../../../shared/api/recordAnnotations";
import { useClinicalAiDraft, type AiRecordUndo } from "./useClinicalAiDraft";
import { DiagnosisPanel } from "./DiagnosisPanel";
import { ClinicalVitalsFields } from "./ClinicalVitalsFields";
import { StructuredNoteForm, ClinicalRecordReadView } from "./StructuredNoteFields";
import { NoteTemplateBar, mergeNoteTemplateContent, clinicalRecordAdditionalFields, type NoteTemplateField } from "./NoteTemplateBar";
import { createClinicalDraftSaver } from "./saveClinicalDraft";
import { createClinicalAmendmentWriter, signClinicalDocument } from "./clinicalDocumentWorkflow";
import { useClinicalDocumentSession } from "./useClinicalDocumentSession";
import { useClinicalDraftSession, type ClinicalDraftSession } from "./useClinicalDraftSession";
import { type OutpatientCompletionMode } from "./completionFacts";
import { ClinicalRecordValidationError, clinicalRecordContent, createRecordSchema, diagnosisDraftSignature, normalizeDiagnosisOrder, structuredFormSignature, validateStructuredForm, type RecordForm } from "./clinicalRecordDraft";
import type { ClinicalAiFieldStream } from "../../../shared/api/clinicalAiStream";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm, type FieldErrors } from "react-hook-form";
import type { ClinicalDocument } from "../../../shared/api/clinicalDocumentsApi";
import type { ClinicalAiDraftContext, ClinicalAiRecordText } from "../../../shared/api/clinicalAiApi";
import type { DiagnosisInput } from "../../../shared/api/encountersApi";
import { useAiPlanApplication, type PrepareAiPlan } from "./useAiPlanApplication";
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent } from "../../../shared/api/outpatientNoteTemplatesApi";
import type { OutpatientNoteForm } from "../../../shared/api/outpatientNoteFormsApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { formatTime } from "../../../shared/format";
import { requiresBloodPressure } from "../bloodPressurePolicy";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, FormField, Icon, IconButton, Panel, PanelHead } from "../../../shared/ui";
import type { MedicationPlanDraft } from "../orders/medicationDraft";
import { type AiOrderReviewCommand, type ServicePlanDraft } from "../UnifiedOrderListEditor";
import type { ClinicalAiSurfaceRefs } from "../ai/ClinicalAiInlineWorkspace";
import { clinicalAiContextFingerprint, type ClinicalAiDraftRequest } from "../ai/aiDraftAdapter";
import type { AiPreConsultation, VitalsSummary } from "../waiting/queueTypes";
import { type HistoryCopyDraft, type EncounterDraftState, medicationDraftKey } from '../workstation/workstationShared'
import { OrdersPanel } from '../orders/OrdersPanel'
import { PlanTemplatePanel } from '../templates/PlanTemplatePanel'
import { ControlledPrintDialog } from '../printing/EncounterPrintPanel'

export type AmendmentDraft = Pick<RecordForm,
  'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'allergyHistory' | 'medicationHistory' | 'auxiliaryExaminations' | 'healthEducation' | 'followUp'>

export function ClinicalRecordPanel({ encounter, birthDate, allergies, allergyState, api, historyCopy, onHistoryCopyConsumed,
  aiDraft, onAiDraftConsumed, onRegisterAiPlan, onAiContextChange, onDraftStateChange, onRegisterSaveDraft, onSaveDraftNotice,
  editing, canEdit, completionMode, enteringEdit, onRequestEditing,
  onRequestReading, onRefresh, aiPreConsultation, triageVitals, historyEncounters, aiSurfaceRefs, aiFieldStream,
  aiOrderReview, onAiOrderReviewConsumed, onTreatmentKeysChange, currentDepartmentName, planTemplateDrawerHost, recommendedPlanId,
  onClosePlanDrawer,
  onOpenPrintCenter }: {
  encounter: Encounter; birthDate?: string; allergies: AllergyIntolerance[]; allergyState: ClinicalAiDraftContext['allergyState']
  completionMode: OutpatientCompletionMode | undefined
  api: RhnApi; historyCopy: HistoryCopyDraft | null
  aiDraft: ClinicalAiDraftRequest | null; onAiDraftConsumed: () => void
  onRegisterAiPlan: (handler: PrepareAiPlan | null) => void
  onAiContextChange: (value: ClinicalAiDraftContext | null) => void
  onHistoryCopyConsumed: () => void; onDraftStateChange: (value: EncounterDraftState) => void
  onRegisterSaveDraft?: (handler: (() => Promise<boolean>) | null) => void
  onSaveDraftNotice?: (notice: { message: string; tone?: 'success' | 'error' | 'warning' }) => void
  editing: boolean; canEdit: boolean; enteringEdit: boolean; onRequestEditing: () => void; onRequestReading: () => void
  onRefresh: () => Promise<unknown>
  aiPreConsultation?: AiPreConsultation
  aiSurfaceRefs: ClinicalAiSurfaceRefs
  aiFieldStream?: ClinicalAiFieldStream | null
  aiOrderReview?: AiOrderReviewCommand | null
  onAiOrderReviewConsumed?: () => void
  onTreatmentKeysChange?: (keys: string[]) => void
  triageVitals?: VitalsSummary
  historyEncounters?: Encounter[]
  currentDepartmentName?: string
  recommendedPlanId?: string
  planTemplateDrawerHost?: HTMLDivElement | null
  onClosePlanDrawer?: () => void
  onOpenPrintCenter?: () => void
}) {
  const queryClient = useQueryClient()
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
  const [medicationDrafts, setMedicationDrafts] = useState<MedicationPlanDraft[]>([])
  const [serviceDrafts, setServiceDrafts] = useState<ServicePlanDraft[]>([])
  const [orderBusy, setOrderBusy] = useState(false)
  const [copyNotice, setCopyNotice] = useState('')
  const [showRecordAnnotations, setShowRecordAnnotations] = useState(true)
  const [aiRecordUndo, setAiRecordUndo] = useState<AiRecordUndo | null>(null)
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [unsignedPrintModalOpen, setUnsignedPrintModalOpen] = useState(false)
  const [amendmentOpen, setAmendmentOpen] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const [amendmentDraft, setAmendmentDraft] = useState<AmendmentDraft>({
    chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', allergyHistory: '', medicationHistory: '', auxiliaryExaminations: '', healthEducation: '', followUp: '',
  })
  const [selectedNoteFormId, setSelectedNoteFormId] = useState('')
  const [structuredValues, setStructuredValues] = useState<Record<string, unknown>>({})
  const [structuredBaseline, setStructuredBaseline] = useState(structuredFormSignature('', {}))
  const [structuredErrors, setStructuredErrors] = useState<Record<string, string>>({})
  const draftSaver = useRef(createClinicalDraftSaver())
  const serverStateInitialized = useRef(false)
  const bloodPressureRequired = requiresBloodPressure(birthDate, encounter.registeredAt)
  const recordSchema = useMemo(() => createRecordSchema(bloodPressureRequired), [bloodPressureRequired])
  const form = useForm<RecordForm>({
    resolver: zodResolver(recordSchema),
    defaultValues: { chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '', allergyHistory: '', medicationHistory: '', auxiliaryExaminations: '', healthEducation: '', followUp: '',
      systolic: undefined, diastolic: undefined, temperature: undefined, pulseRate: undefined,
      respiratoryRate: undefined, heightCm: undefined, weightKg: undefined, oxygenSaturation: undefined },
  })
  const { handleSubmit, reset, getValues, watch, formState } = form
  const recordFormRef = useRef<HTMLFormElement>(null)
  const [recordErrorFocusRequest, setRecordErrorFocusRequest] = useState(0)
  useEffect(() => {
    if (!recordErrorFocusRequest) return
    const frame = requestAnimationFrame(() => {
      const control = recordFormRef.current?.querySelector<HTMLElement>('.is-invalid textarea, .is-invalid input, .is-invalid select')
      control?.focus()
      control?.scrollIntoView?.({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [recordErrorFocusRequest])
  const documents = useQuery({ queryKey: ['doctor-document', encounter.id], queryFn: () => api.clinicalDocuments.byEncounter(encounter.id) })
  const noteForms = useQuery({ queryKey: ['outpatient-note-forms', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteForms.list('GENERAL_PRACTICE') })
  const document = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE' && item.instanceKey === 'DEFAULT')
  const snapshot = document?.content.structuredForm
  const snapshotForm: OutpatientNoteForm | undefined = snapshot ? {
    id: snapshot.versionId, formCode: snapshot.formCode, version: snapshot.version,
    specialtyCode: snapshot.specialtyCode, name: snapshot.name, description: snapshot.description,
    definitionSchema: snapshot.definitionSchema, sections: snapshot.sections, status: 'PUBLISHED',
    publishedBy: '', publishedAt: snapshot.publishedAt,
  } : undefined
  const selectedNoteForm = noteForms.data?.find((value) => value.id === selectedNoteFormId)
    ?? (snapshotForm?.id === selectedNoteFormId ? snapshotForm : undefined)
  const currentStructuredSignature = structuredFormSignature(selectedNoteFormId, structuredValues)
  const structuredChanged = currentStructuredSignature !== structuredBaseline
  const diagnosesChanged = diagnosisDraftSignature(diagnoses) !== diagnosisDraftSignature(
    encounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms }) =>
      ({ conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms })))
  const captureDraftSession = useClinicalDraftSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit && editing && encounter.status === 'IN_PROGRESS', form,
  { diagnoses, medicationDrafts, serviceDrafts, selectedNoteFormId, structuredValues })
  const save = useMutation({
    mutationFn: async ({ form, session }: { form: RecordForm; session: ClinicalDraftSession }) => {
      session.assertUnchanged()
      if (!diagnoses.some((item) => item.type === 'PRIMARY')) throw new Error('请确认一个主要诊断')
      const formErrors = validateStructuredForm(selectedNoteForm, structuredValues)
      setStructuredErrors(formErrors)
      if (Object.keys(formErrors).length) throw new Error(Object.values(formErrors)[0])
      return draftSaver.current.save(api, {
        encounterId: encounter.id,
        residentId: encounter.residentId,
        organizationId: encounter.organizationId,
        departmentId: encounter.departmentId,
        previousDocument: document,
        content: clinicalRecordContent(form, diagnoses, selectedNoteFormId, structuredValues),
        medicationDrafts,
        serviceDrafts,
      }, session.assertUnchanged)
    },
    onSuccess: async ({ encounter: savedEncounter, document: savedDocument, documents: savedDocuments, confirmApplied }, { form, session }) => {
      session.assertUnchanged()
      confirmApplied()
      setCopyNotice('')
      setMedicationDrafts([])
      setServiceDrafts([])

      reset({
        annotations: savedDocument.content.annotations,
        chiefComplaint: form.chiefComplaint,
        presentIllness: form.presentIllness,
        medicalHistory: form.medicalHistory,
        physicalExam: form.physicalExam,
        treatmentPlan: '',
        allergyHistory: form.allergyHistory,
        medicationHistory: form.medicationHistory,
        auxiliaryExaminations: form.auxiliaryExaminations,
        healthEducation: form.healthEducation,
        followUp: form.followUp,

        systolic: form.systolic,
        diastolic: form.diastolic,
        temperature: form.temperature,
        pulseRate: form.pulseRate,
        respiratoryRate: form.respiratoryRate,
        heightCm: form.heightCm,
        weightKg: form.weightKg,
        oxygenSaturation: form.oxygenSaturation,
      })

      if (savedEncounter?.diagnoses?.length) {
        setDiagnoses(normalizeDiagnosisOrder(savedEncounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms }) => ({
          conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type, managementResolutionStatus, managementPrograms,
        }))))
      }

      const savedFormId = savedDocument.content.structuredForm?.versionId ?? ''
      const savedValues = savedDocument.content.structuredData ?? {}
      setSelectedNoteFormId(savedFormId)
      setStructuredValues(savedValues)
      setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))

      if (savedEncounter) {
        queryClient.setQueriesData({ queryKey: ['doctor-encounters'] }, (old: unknown) => {
          if (!Array.isArray(old)) return old
          return old.map((item: Encounter) => item.id === encounter.id ? { ...item, ...savedEncounter } : item)
        })
      }

      queryClient.setQueryData(['doctor-document', encounter.id], savedDocuments)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
        queryClient.invalidateQueries({ queryKey: ['doctor-billing-statement', encounter.id] }),
        onRefresh(),
      ])
      session.assertCurrent()
      onSaveDraftNotice?.({ message: '门诊病历、诊断与医嘱草稿已保存', tone: 'success' })
    },
    onError: (error, { session }) => {
      if (!session.isCurrent()) return
      onSaveDraftNotice?.({ message: errorMessage(error), tone: 'error' })
    },
  })
  const recordContentChanged = Boolean(aiRecordUndo)
    || formState.isDirty
    || (getValues().chiefComplaint?.trim() ?? '') !== (encounter.chiefComplaint?.trim() ?? '')
    || (getValues().presentIllness?.trim() ?? '') !== (document?.content.presentIllness?.trim() ?? '')
    || (getValues().medicalHistory?.trim() ?? '') !== (document?.content.medicalHistory?.trim() ?? '')
    || (getValues().physicalExam?.trim() ?? '') !== (document?.content.physicalExam?.trim() ?? '')
    || (getValues().allergyHistory?.trim() ?? '') !== (document?.content.allergyHistory?.trim() ?? '')
    || (getValues().medicationHistory?.trim() ?? '') !== (document?.content.medicationHistory?.trim() ?? '')
    || (getValues().auxiliaryExaminations?.trim() ?? '') !== (document?.content.auxiliaryExaminations?.trim() ?? '')
    || (getValues().healthEducation?.trim() ?? '') !== (document?.content.healthEducation?.trim() ?? '')
    || (getValues().followUp?.trim() ?? '') !== (document?.content.followUp?.trim() ?? '')
  useEffect(() => {
    if (save.isPending) return
    const hasLocalWork = recordContentChanged || structuredChanged || diagnosesChanged
      || medicationDrafts.length > 0 || serviceDrafts.length > 0
    if (serverStateInitialized.current && hasLocalWork) return
    if (!serverStateInitialized.current && documents.isPending) return

    reset({ annotations: document?.content.annotations ?? [], chiefComplaint: encounter.chiefComplaint ?? '', presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '', physicalExam: document?.content.physicalExam ?? '',
      treatmentPlan: '', allergyHistory: document?.content.allergyHistory ?? '', medicationHistory: document?.content.medicationHistory ?? '', auxiliaryExaminations: document?.content.auxiliaryExaminations ?? '', healthEducation: document?.content.healthEducation ?? '', followUp: document?.content.followUp ?? '',  systolic: encounter.systolic, diastolic: encounter.diastolic,
      temperature: document?.content.vitalSigns?.temperature, pulseRate: document?.content.vitalSigns?.pulseRate,
      respiratoryRate: document?.content.vitalSigns?.respiratoryRate, heightCm: document?.content.vitalSigns?.heightCm,
      weightKg: document?.content.vitalSigns?.weightKg, oxygenSaturation: document?.content.vitalSigns?.oxygenSaturation })
    setDiagnoses(normalizeDiagnosisOrder(encounter.diagnoses.map(({ conceptId, systemCode, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementResolutionStatus, managementPrograms }) => ({ conceptId, codeSystem: systemCode, diagnosisDomain, diagnosisGroupId, code, display, type,
      managementResolutionStatus, managementPrograms }))))
    const savedFormId = document?.content.structuredForm?.versionId ?? ''
    const savedValues = document?.content.structuredData ?? {}
    setSelectedNoteFormId(savedFormId)
    setStructuredValues(savedValues)
    setStructuredErrors({})
    setStructuredBaseline(structuredFormSignature(savedFormId, savedValues))
    serverStateInitialized.current = true
  }, [diagnosesChanged, document, documents.isPending, encounter, formState.isDirty, getValues, medicationDrafts.length, recordContentChanged, reset,
    save.isPending, serviceDrafts.length, structuredChanged])
  useEffect(() => {
    setMedicationDrafts([])
    setServiceDrafts([])
  }, [encounter.id])
  useEffect(() => {
    if (!historyCopy || documents.isPending) return
    if (historyCopy.targetEncounterId && (historyCopy.targetEncounterId !== encounter.id
      || historyCopy.targetResidentId !== encounter.residentId) || save.isPending || orderBusy
      || document?.status === 'SIGNED' || encounter.status !== 'IN_PROGRESS'
      || (historyCopy.medicationDrafts?.length && allergyState !== 'READY')) {
      setCopyNotice('当前就诊状态或过敏资料已变化，已拒绝历史内容带入，请重新核对。')
      onHistoryCopyConsumed(); return
    }
    if (historyCopy.medicationDrafts?.length) {
      const keys = new Set(medicationDrafts.map(medicationDraftKey))
      if (historyCopy.medicationDrafts.some(item => keys.has(medicationDraftKey(item)))) {
        setCopyNotice('所选历史用药与当前待确认医嘱重复，本次未带入，请先核对已有草稿。')
        onHistoryCopyConsumed(); return
      }
      setMedicationDrafts(current => [...current, ...historyCopy.medicationDrafts!])
    }
    reset({ ...getValues(), ...historyCopy.record }, { keepDefaultValues: true })
    if (historyCopy.diagnoses?.length) {
      setDiagnoses((current) => {
        const currentCodes = new Set(current.map((item) => item.code))
        const hasPrimary = current.some((item) => item.type === 'PRIMARY')
        return normalizeDiagnosisOrder([...current, ...historyCopy.diagnoses!.filter((item) => !currentCodes.has(item.code)).map((item) => ({
          ...item, type: hasPrimary && item.type === 'PRIMARY' ? 'SECONDARY' as const : item.type,
        }))])
      })
    }
    setCopyNotice(`已从 ${formatTime(historyCopy.sourceRegisteredAt)}（${historyCopy.sourceEncounterNo}）带入所选内容，请核对后保存。`)
    onHistoryCopyConsumed()
  }, [documents.isPending, getValues, historyCopy, onHistoryCopyConsumed, reset, encounter, save.isPending, orderBusy, document?.status, allergyState, medicationDrafts])
  const captureDocumentSession = useClinicalDocumentSession(api, JSON.stringify([encounter.id, encounter.residentId,
    encounter.organizationId, encounter.departmentId]), canEdit)
  const amendmentWriter = useRef(createClinicalAmendmentWriter())
  const cacheSignedDocument = (signed: ClinicalDocument) => {
    queryClient.setQueryData<ClinicalDocument[]>(['doctor-document', signed.encounterId], current =>
      current?.map(item => item.id === signed.id ? signed : item) ?? [signed])
  }
  const sign = useMutation({
    mutationFn: async () => {
      const assertCurrent = captureDocumentSession()
      const signed = await signClinicalDocument(api.clinicalDocuments, document!, assertCurrent)
      return { signed, assertCurrent }
    },
    onSuccess: async ({ signed, assertCurrent }) => {
      assertCurrent()
      cacheSignedDocument(signed)
      await onRefresh()
      assertCurrent()
      onRequestReading()
    },
  })
  const amend = useMutation({
    mutationFn: async () => {
      const assertCurrent = captureDocumentSession()
      const signed = await amendmentWriter.current.save(api.clinicalDocuments, document!,
        { ...document!.content, ...amendmentDraft }, amendmentReason, assertCurrent)
      return { signed, assertCurrent }
    },
    onSuccess: async ({ signed, assertCurrent }) => {
      assertCurrent()
      cacheSignedDocument(signed)
      setAmendmentOpen(false)
      setAmendmentReason('')
      await onRefresh()
      assertCurrent()
      onRequestReading()
    },
  })
  const businessBusy = save.isPending || sign.isPending || amend.isPending || orderBusy
  const aiContextBusy = businessBusy || documents.isPending || Boolean(documents.error)
  const documentStatus = documents.isPending ? 'LOADING'
    : documents.error ? 'ERROR' : document?.status ?? 'NONE'
  const { buildAiContext, canUndoAiRecord, undoAiRecord } = useClinicalAiDraft({
    encounter, form, diagnoses, setDiagnoses, aiDraft, onAiDraftConsumed, onAiContextChange,
    context: { document, documentStatus, structuredFormId: selectedNoteFormId,
      structuredFormVersion: selectedNoteForm?.version, structuredValues,
      medicationDrafts, serviceDrafts, allergies, allergyState, busy: aiContextBusy },
    businessBusy, aiRecordUndo, setAiRecordUndo, onNotice: setCopyNotice,
  })
  const preparePlan = useAiPlanApplication({ api, encounter, form, readContext: buildAiContext,
    blocked: !editing || document?.status === 'SIGNED' || aiContextBusy, allergies, allergyReady: allergyState === 'READY',
    diagnoses, setDiagnoses, medications: medicationDrafts, setMedications: setMedicationDrafts,
    services: serviceDrafts, setServices: setServiceDrafts, setUndo: setAiRecordUndo, onNotice: setCopyNotice })
  useEffect(() => {
    onRegisterAiPlan(preparePlan)
    return () => onRegisterAiPlan(null)
  }, [onRegisterAiPlan, preparePlan])
  useEffect(() => {
    onDraftStateChange({ recordChanged: recordContentChanged || structuredChanged, diagnosesChanged,
      medicationDraftCount: medicationDrafts.length, serviceDraftCount: serviceDrafts.length,
      busy: businessBusy })
  }, [businessBusy, diagnosesChanged, medicationDrafts.length, onDraftStateChange, recordContentChanged,
    serviceDrafts.length, structuredChanged])
  const persistRecordDraft = save.mutateAsync
  const submitRecordDraft = useCallback(async (value: RecordForm) => {
      if (aiFieldStream?.encounterId === encounter.id) {
        onSaveDraftNotice?.({ message: 'AI 正在生成，请待完整病历带入并核对后保存。', tone: 'warning' })
        return false
      }
      try {
        const current = recordSchema.safeParse(getValues())
        if (!current.success || JSON.stringify(current.data) !== JSON.stringify(value)) {
          onSaveDraftNotice?.({ message: '校验期间病历内容已变化，请核对当前内容后重新保存', tone: 'warning' })
          return false
        }
        await persistRecordDraft({ form: value, session: captureDraftSession() })
        return true
      } catch {
        return false
      }
  }, [aiFieldStream?.encounterId, encounter.id, onSaveDraftNotice, recordSchema, getValues, persistRecordDraft, captureDraftSession])
  const reportRecordErrors = useCallback((formErrors: FieldErrors<RecordForm>) => {
    const first = Object.values(formErrors)[0]?.message
    onSaveDraftNotice?.({
      message: typeof first === 'string' ? first : '请检查病历表单必填项',
      tone: 'error',
    })
  }, [onSaveDraftNotice])
  const handleRecordSubmit = handleSubmit((value) => { void submitRecordDraft(value) }, reportRecordErrors)
  const saveDraftAndWait = useCallback(async () => {
    let saved = false
    await handleSubmit(async (value) => { saved = await submitRecordDraft(value) }, reportRecordErrors)()
    return saved
  }, [handleSubmit, submitRecordDraft, reportRecordErrors])
  useEffect(() => {
    onRegisterSaveDraft?.(saveDraftAndWait)
    return () => onRegisterSaveDraft?.(null)
  }, [onRegisterSaveDraft, saveDraftAndWait])
  const signed = document?.status === 'SIGNED'
  const recordValues = watch()
  const streamingRecord = aiFieldStream?.encounterId === encounter.id
    && aiFieldStream.contextFingerprint === clinicalAiContextFingerprint(buildAiContext()) ? aiFieldStream.recordDraft : null
  const streamingField = (field: keyof ClinicalAiRecordText) => ({
    value: streamingRecord?.[field] ?? recordValues[field] ?? '',
    readOnly: streamingRecord !== null,
    'aria-busy': streamingRecord !== null || undefined,
    className: streamingRecord !== null ? 'doctor-record-field--generating' : undefined,
  })
  const height = recordValues.heightCm
  const weight = recordValues.weightKg
  const bmi = height && weight && Number(height) > 0 ? (Number(weight) / ((Number(height) / 100) ** 2)).toFixed(1) : undefined

  const currentNoteContent = (): OutpatientNoteTemplateContent => {
    const value = getValues()
    return { annotations: value.annotations, chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
      medicalHistory: value.medicalHistory, physicalExam: value.physicalExam, allergyHistory: value.allergyHistory, medicationHistory: value.medicationHistory, auxiliaryExaminations: value.auxiliaryExaminations, healthEducation: value.healthEducation, followUp: value.followUp,  }
  }
  const annotatedField = (field: RecordTextField, label: string) => ({
    field, 'aria-label': label, value: watch(field) ?? '', annotations: getValues('annotations') ?? [],
    showAnnotations: showRecordAnnotations,
    onValueChange: (value: string) => {
      form.setValue('annotations', rebaseAnnotations(field, getValues(field) ?? '', value, getValues('annotations') ?? []), { shouldDirty: true })
      form.setValue(field, value, { shouldDirty: true, shouldTouch: true })
    },
  })
  const openAmendment = () => {
    setAmendmentReason('')
    setAmendmentDraft({
      chiefComplaint: document?.content.chiefComplaint ?? encounter.chiefComplaint ?? '',
      presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '',
      physicalExam: document?.content.physicalExam ?? '',
      allergyHistory: document?.content.allergyHistory ?? '', medicationHistory: document?.content.medicationHistory ?? '', auxiliaryExaminations: document?.content.auxiliaryExaminations ?? '', healthEducation: document?.content.healthEducation ?? '', followUp: document?.content.followUp ?? '',
    })
    setAmendmentOpen(true)
  }
  const applyNoteTemplate = (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => {
    const current = getValues()
    const merged = mergeNoteTemplateContent(current, template.content, fields, overwrite)
    const applied = [...fields].filter(key => merged[key] !== current[key]).length
    if (applied) {
      reset({ ...current, ...merged }, { keepDefaultValues: true })
      setCopyNotice(`已从病历模板“${template.name}”带入 ${applied} 个段落，请结合本次患者情况核对后保存。`)
    }
    return applied
  }
  const error = (save.variables?.session.isCurrent() ? save.error : undefined) || sign.error || amend.error || documents.error || noteForms.error
  const encounterEditable = ['REGISTERED', 'IN_PROGRESS', 'SUSPENDED'].includes(encounter.status)
  const editActionLabel = encounter.status === 'REGISTERED' ? '开始接诊'
    : encounter.status === 'SUSPENDED' ? '恢复接诊' : '进入编辑'
  const readOnlyReason = !canEdit ? '当前账号没有病历编辑权限'
    : !encounterEditable ? '本次就诊已结束；如需更正，应发起病历修订并保留原始版本'
      : signed ? '病历已签署；如需更正，应发起病历修订' : ''

  return <section className={`doctor-clinical-cockpit ${editing ? 'is-editing' : 'is-reading'}`}>
    {!editing && <div className="doctor-clinical-modebar">
      <div className="doctor-clinical-modebar__status">
        <strong>阅读状态</strong>
        <small>{signed ? '病历已签署' : document ? '仅查看，不会修改就诊状态和时间' : '尚未形成病历记录'}</small>
      </div>
      {readOnlyReason && <div className="doctor-clinical-readonly-note">
        <Icon name="lock" />
        <span>{readOnlyReason}</span>
      </div>}
      {encounterEditable && <Button size="sm" busy={enteringEdit} disabled={Boolean(readOnlyReason)}
          title={readOnlyReason || `${editActionLabel}后可修改病历`}
          onClick={onRequestEditing}>{editActionLabel}</Button>}
    </div>}
    <div className="doctor-record-column"><Panel className="doctor-record-panel">
      <PanelHead className="doctor-record-heading" title="门诊病历"
        meta={signed ? '已签署' : document ? `草稿 V${document.currentVersion}` : '尚未保存'}
        actions={<>
          {editing && <NoteTemplateBar api={api} disabled={signed || businessBusy || documents.isPending || Boolean(documents.error)}
          contextKey={JSON.stringify([encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId,
            encounter.clinicianId, document?.currentVersion])} currentContent={currentNoteContent}
          onApply={applyNoteTemplate} showApply={false} />}
          {editing && !signed && <div ref={aiSurfaceRefs.note} className="doctor-record-ai-slot" />}
          {document && signed && canEdit && (
            <Button size="sm" variant="secondary" onClick={openAmendment}>发起更正</Button>
          )}
          <IconButton icon="print" label="打印病历"
            disabled={!document}
            title={!document ? '门诊病历尚未保存，请先录入并保存' : !signed ? '门诊病历签署后方可受控打印' : '受控打印已签署门诊病历'}
            onClick={() => {
              if (document && signed) {
                setNotePrintOpen(true)
              } else if (document && !signed) {
                setUnsignedPrintModalOpen(true)
              }
            }}
          />
        </>} />
      {document?.status === 'AMENDMENT_IN_PROGRESS' && canEdit && !editing && <Alert tone="warning">
        更正草稿尚未签署。<Button size="sm" busy={sign.isPending} onClick={() => sign.mutate()}>重新签署更正版</Button>
      </Alert>}
      {error && <Alert>{errorMessage(error)}</Alert>}
      {copyNotice && <div className="doctor-record-adoption-notice"><Icon name="roadmap" /><span>{copyNotice}</span>
        {editing && aiRecordUndo && <Button size="sm" variant="text" disabled={!canUndoAiRecord}
          title={canUndoAiRecord ? '恢复本次采纳前的病历段落' : '相关段落已修改或保存，不能撤销此前采纳'}
          onClick={undoAiRecord}>撤销本次病历采纳</Button>}</div>}
      {editing ? <form ref={recordFormRef} id="doctor-record-form" className="clinical-form doctor-record-form" noValidate onSubmit={handleRecordSubmit}>
        {aiPreConsultation && !signed && (
          <div className="ai-preconsultation-banner">
            <div className="ai-banner-content">
              <Icon name="sparkles" />
              <div>
                <strong>AI 预问诊已提炼主诉与现病史草稿</strong>
                <span>一句话主诉：{aiPreConsultation.chiefComplaintSummary}</span>
              </div>
            </div>
            <div className="ai-banner-actions">
              <Button
                size="sm"
                variant="secondary"
                type="button"
                onClick={() => {
                  const curChief = getValues('chiefComplaint')
                  const curPresent = getValues('presentIllness')
                  reset({
                    ...getValues(),
                    chiefComplaint: curChief || aiPreConsultation.chiefComplaintSummary,
                    presentIllness: curPresent || aiPreConsultation.presentIllnessDraft,
                  }, { keepDefaultValues: true })
                }}
              >
                <Icon name="sparkles" />
                一键采纳预问诊草稿
              </Button>
            </div>
          </div>
        )}
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--chief" label="主诉" required error={formState.errors.chiefComplaint?.message}>
          <AnnotatedRecordField {...annotatedField('chiefComplaint', '主诉')} {...streamingField('chiefComplaint')} disabled={signed} placeholder="症状、持续时间及本次就诊原因" rows={1} />
        </FormField>
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--present" label="现病史" error={formState.errors.presentIllness?.message}>
          <AnnotatedRecordField {...annotatedField('presentIllness', '现病史')} {...streamingField('presentIllness')} disabled={signed} placeholder="起病、演变、伴随症状及诊治经过" rows={3} />
        </FormField>
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--history" label="既往史" error={formState.errors.medicalHistory?.message}>
          <AnnotatedRecordField {...annotatedField('medicalHistory', '既往史')} {...streamingField('medicalHistory')} disabled={signed} placeholder="既往疾病、手术、过敏及长期用药" rows={2} />
        </FormField>
        <ClinicalVitalsFields api={api} encounterId={encounter.id} historyEncounters={historyEncounters}
          triageVitals={triageVitals} form={form} recordValues={recordValues} bmi={bmi}
          signed={signed} bloodPressureRequired={bloodPressureRequired} />
        <FormField appearance="document" className="doctor-record-narrative doctor-record-field--exam" label="查体所见" error={formState.errors.physicalExam?.message}>
          <AnnotatedRecordField {...annotatedField('physicalExam', '查体所见')} {...streamingField('physicalExam')} disabled={signed} placeholder="阳性体征及必要的阴性体征" rows={3} />
        </FormField>
        {clinicalRecordAdditionalFields
          .map(({ key, label }) => <FormField appearance="document" key={key} className="doctor-record-narrative doctor-record-writing-field" label={label} error={formState.errors[key]?.message}>
            <AnnotatedRecordField {...annotatedField(key as RecordTextField, label)} {...streamingField(key)} disabled={signed} rows={2}
              placeholder={`记录本次${label}，缺失资料请留空或注明待询问`} />
          </FormField>)}
        {selectedNoteForm && <StructuredNoteForm form={selectedNoteForm} values={structuredValues}
          errors={structuredErrors} disabled={signed} onChange={(code, value) => {
            setStructuredValues((current) => ({ ...current, [code]: value }))
            setStructuredErrors((current) => ({ ...current, [code]: '' }))
          }} />}
        {document && !signed && completionMode === 'SEPARATE_CONFIRMATIONS' && (
          <div className="ui-form-actions doctor-record-actions">
            <Button type="button" variant="secondary" busy={sign.isPending}
              disabled={formState.isDirty || structuredChanged || diagnosesChanged || save.isPending || Boolean(aiFieldStream)}
              title={formState.isDirty || structuredChanged || diagnosesChanged ? '请先保存当前病历和诊断修改' : '签署当前已保存版本'}
              onClick={() => sign.mutate()}>签署当前版本</Button>
          </div>
        )}
        <div className="doctor-record-annotation-footer" aria-label="病历标记设置">
          {showRecordAnnotations && (recordValues.annotations?.length ?? 0) > 0 && <RecordAnnotationLegend />}
          <Button size="sm" variant="text" aria-pressed={showRecordAnnotations}
            onClick={() => setShowRecordAnnotations(value => !value)}>{showRecordAnnotations ? '隐藏标记' : '显示标记'}</Button>
        </div>
      </form> : <ClinicalRecordReadView value={recordValues} bmi={bmi} structuredForm={selectedNoteForm}
        structuredValues={structuredValues} />}
    </Panel>

    </div>
    <aside className="doctor-clinical-aside" aria-label="诊断与医嘱工作区">
      <DiagnosisPanel encounterId={encounter.id} api={api} diagnoses={diagnoses} setDiagnoses={setDiagnoses}
        editing={editing} signed={signed} aiSuggestionSurfaceRef={aiSurfaceRefs.diagnoses} />
      <OrdersPanel draftDiagnoses={diagnoses} onSaveClinicalDraft={async () => {
        if (!recordContentChanged && !diagnosesChanged && !structuredChanged
          && medicationDrafts.length === 0 && serviceDrafts.length === 0) return true
        const valid = await form.trigger()
        const structuredValidationErrors = validateStructuredForm(selectedNoteForm, structuredValues)
        setStructuredErrors(structuredValidationErrors)
        const parsed = recordSchema.safeParse(form.getValues())
        if (!valid || !parsed.success || Object.keys(structuredValidationErrors).length) {
          throw new ClinicalRecordValidationError([
            ...(!parsed.success ? parsed.error.issues.map(issue => issue.message) : []),
            ...Object.values(structuredValidationErrors),
          ])
        }
        await save.mutateAsync({ form: recordSchema.parse(form.getValues()), session: captureDraftSession() })
        return true
      }} onEditInvalidRecord={() => setRecordErrorFocusRequest(value => value + 1)}
        aiOrderReview={aiOrderReview} onAiOrderReviewConsumed={onAiOrderReviewConsumed}
        onTreatmentKeysChange={onTreatmentKeysChange} encounter={encounter} allergies={allergies} api={api} editing={editing}
        aiSuggestionSurfaceRef={editing && !signed ? aiSurfaceRefs.plans : undefined}
        medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
        serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts} onBusyChange={setOrderBusy}
        currentDepartmentName={currentDepartmentName} onOpenPrintCenter={onOpenPrintCenter} />
    </aside>
    {editing && !signed && planTemplateDrawerHost && createPortal(
      <PlanTemplatePanel initialPlanId={recommendedPlanId} encounter={encounter} busy={aiContextBusy}
        allergies={allergies} allergyReady={allergyState === 'READY'}
        allergyContext={JSON.stringify([allergyState, allergies])} readRecordDraft={() => JSON.stringify(getValues())}
        diagnoses={diagnoses} setDiagnoses={setDiagnoses}
        medicationDrafts={medicationDrafts} setMedicationDrafts={setMedicationDrafts}
        serviceDrafts={serviceDrafts} setServiceDrafts={setServiceDrafts}
        onApplyNoteTemplate={applyNoteTemplate}
        api={api}
        onClose={onClosePlanDrawer}
        onNotice={(msg) => onSaveDraftNotice?.({ message: msg, tone: 'success' })} />,
      planTemplateDrawerHost,
    )}
    {notePrintOpen && document && <ControlledPrintDialog api={api} title="打印门诊病历"
      description={`已签署版本 V${document.currentVersion} · 每次生成和重打都会留痕。`}
      sourceLabel={`${document.title} · V${document.currentVersion}`}
      generate={(purpose, copies) => api.printing.clinicalDocument(document.id, purpose, copies)}
      onGenerated={() => void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })}
      onClose={() => setNotePrintOpen(false)} />}
    {unsignedPrintModalOpen && document && (
      <Dialog
        title="门诊病历打印受控规范"
        eyebrow="文书签署要求"
        description="依据医疗文书管理与受控打印规范，门诊病历属于法定医疗文书，需由责任医师完成电子签名签署后方可生成不可变正式打印单。"
        closeOnBackdrop={false}
        onClose={() => setUnsignedPrintModalOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnsignedPrintModalOpen(false)}>暂不打印</Button>
            {canEdit && editing && (
              <Button
                variant="primary"
                busy={sign.isPending}
                disabled={formState.isDirty || structuredChanged || diagnosesChanged || save.isPending}
                title={formState.isDirty || structuredChanged || diagnosesChanged ? '请先保存病历草稿后再签署' : '完成当前版本签署并打开打印窗口'}
                onClick={async () => {
                  try {
                    const result = await sign.mutateAsync()
                    result.assertCurrent()
                    setUnsignedPrintModalOpen(false)
                    setNotePrintOpen(true)
                  } catch {
                    // handled by sign mutation error
                  }
                }}
              >
                <Icon name="check" />签署并打印
              </Button>
            )}
          </>
        }
      >
        <div className="doctor-print-compliance-notice">
          <Alert tone="info">
            当前病历版本为<strong>草稿 V{document.currentVersion}</strong>。受控打印平台要求文书已签署且具备防篡改签名凭证。
            {canEdit && editing && (formState.isDirty || structuredChanged || diagnosesChanged
              ? ' 当前存在未保存的修改，请先保存全部草稿后再执行签署。'
              : ' 您可点击下方【签署并打印】完成正式签署，系统将自动调起受控打印。')}
          </Alert>
        </div>
      </Dialog>
    )}
    {amendmentOpen && document && <Dialog title="发起病历更正" eyebrow={`已签署版本 V${document.currentVersion}`}
      size="xwide"
      closeOnBackdrop={false}
      description="原签署版本和签名证据将完整保留；以下更正内容将生成新版本并重新签署。"
      onClose={() => !amend.isPending && setAmendmentOpen(false)}
      footer={<><Button variant="secondary" disabled={amend.isPending} onClick={() => setAmendmentOpen(false)}>取消</Button>
        <Button busy={amend.isPending} disabled={!amendmentReason.trim() || !amendmentDraft.chiefComplaint.trim()}
          onClick={() => amend.mutate()}>更正并重新签署</Button></>}>
      <div className="doctor-amendment-form" inert={amend.isPending}>
        <FormField label="更正原因" required error={amend.error ? errorMessage(amend.error) : undefined}>
          <textarea className="ui-field__control" value={amendmentReason} maxLength={500} autoFocus
            onChange={(event) => setAmendmentReason(event.target.value)}
            placeholder="说明需要更正的内容和原因" />
        </FormField>
        <FormField label="主诉" required>
          <textarea className="ui-field__control" value={amendmentDraft.chiefComplaint}
            onChange={(event) => setAmendmentDraft((current) => ({ ...current, chiefComplaint: event.target.value }))} />
        </FormField>
        {([
          ['presentIllness', '现病史'], ['medicalHistory', '既往史'], ['physicalExam', '体格检查'], ['auxiliaryExaminations', '辅助检查结果'], ['healthEducation', '健康宣教'], ['followUp', '随访复诊'],
        ] as const).map(([field, label]) => <FormField key={field} label={label}>

          <textarea className="ui-field__control" value={amendmentDraft[field]}
            onChange={(event) => setAmendmentDraft((current) => ({ ...current, [field]: event.target.value }))} />
        </FormField>)}
      </div>
    </Dialog>}
  </section>
}
