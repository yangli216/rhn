import type { ClinicalDocument } from '../../../shared/api/clinicalDocumentsApi'
import type { ClinicalAiDraftContext } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { stableClinicalAiFingerprint } from '../ai/aiDraftAdapter'
import type { RecordForm } from './clinicalRecordDraft'

export interface ClinicalAiContextState {
  document?: ClinicalDocument
  documentStatus: string
  structuredFormId: string
  structuredFormVersion?: number
  structuredValues: Record<string, unknown>
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
  allergies: AllergyIntolerance[]
  allergyState: ClinicalAiDraftContext['allergyState']
  busy: boolean
}

export function aiContextFromDraft(value: RecordForm, diagnoses: DiagnosisInput[], encounter: Encounter,
  state: ClinicalAiContextState): ClinicalAiDraftContext {
  return {
    encounterId: encounter.id, residentId: encounter.residentId,
    encounterStatus: encounter.status,
    documentVersion: state.document?.currentVersion ?? 0,
    documentStatus: state.documentStatus,
    structuredContextFingerprint: stableClinicalAiFingerprint('structured', {
      formId: state.structuredFormId, formVersion: state.structuredFormVersion ?? 0,
      values: state.structuredValues,
    }),
    medicationDraftFingerprint: stableClinicalAiFingerprint('medications', state.medicationDrafts),
    serviceDraftFingerprint: stableClinicalAiFingerprint('services', state.serviceDrafts),
    allergyContextFingerprint: stableClinicalAiFingerprint('allergies', [...state.allergies]
      .sort((left, right) => left.id.localeCompare(right.id))),
    allergyState: state.allergyState,
    busy: state.busy,
    chiefComplaint: value.chiefComplaint, presentIllness: value.presentIllness,
    medicalHistory: value.medicalHistory, physicalExam: value.physicalExam,
    treatmentPlan: value.treatmentPlan, systolic: value.systolic, diastolic: value.diastolic,
    temperature: value.temperature, pulseRate: value.pulseRate, respiratoryRate: value.respiratoryRate,
    oxygenSaturation: value.oxygenSaturation, heightCm: value.heightCm, weightKg: value.weightKg,
    diagnoses: diagnoses.map(({ code, display, type }) => ({ code, display, type })),
  }
}

