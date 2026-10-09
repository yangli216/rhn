package com.rhn.ai.api;

import com.rhn.outpatient.api.RecordAnnotation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import com.rhn.outpatient.api.RecordAnnotation;

public final class ClinicalAssistantContracts {
    private ClinicalAssistantContracts() {}

    public record Capabilities(String mode, boolean available, String provider, String model,
                               String message, List<String> features) {
        public Capabilities {
            features = features == null ? List.of() : List.copyOf(features);
        }
    }

    public enum ReceptionScene { FIRST_VISIT, CHRONIC_REFILL, REPORT_FOLLOW_UP }

    /** Selection hints only; report facts are always loaded through the authorized server directory. */
    public record ReceptionSceneContext(
            @Size(max = 12) List<@NotBlank @Size(max = 100) String> selectedConditions,
            @Size(max = 50) List<@NotNull @Positive Long> selectedReportIds) {}

    @io.swagger.v3.oas.annotations.media.Schema(name = "ClinicalAssistantGenerateRequest")
    public record GenerateRequest(
            @NotBlank @Size(max = 128) String clientContextFingerprint,
            @Size(max = 500) String question,
            @Size(max = 10000) String voiceTranscript,
            @NotNull @Valid Draft draft,
            @Positive Long parentSuggestionId,
            ReceptionScene receptionScene,
            @Valid ReceptionSceneContext receptionSceneContext) {
        public GenerateRequest(String clientContextFingerprint, String question, String voiceTranscript,
                               Draft draft, Long parentSuggestionId) {
            this(clientContextFingerprint, question, voiceTranscript, draft, parentSuggestionId, null, null);
        }
    }

    public record Transcription(String text, String provider, String model, String contentType,
                                long audioBytes, Instant transcribedAt) {}

    public record KnowledgeSearchRequest(@NotBlank @Size(max = 500) String query) {}

    public record KnowledgeSearch(String query, String provider, List<KnowledgeReference> results,
                                  Instant retrievedAt) {
        public KnowledgeSearch {
            results = results == null ? List.of() : List.copyOf(results);
        }
    }

    public record KnowledgeReference(String id, String title, String excerpt, Double score,
                                     String sourceName, String sourceId, String publishYear,
                                     String resourcePosition) {}

    public record PlanPreflightRequest(
            @Size(max = 50) List<@NotNull @Positive Long> selectedMedicationLineIds,
            boolean allergyReviewConfirmed,
            @Size(max = 1000) String allergyOverrideReason) {
        public PlanPreflightRequest {
            selectedMedicationLineIds = selectedMedicationLineIds == null
                    ? List.of() : List.copyOf(selectedMedicationLineIds);
        }
    }

    public record PlanPreflight(Long templateId, long templateRevision, String status,
                                int blockingCount, int warningCount,
                                List<MedicationPreflight> medications,
                                EvaluationBoundary drugInteractions,
                                EvaluationBoundary contraindications,
                                Instant checkedAt) {
        public PlanPreflight {
            medications = medications == null ? List.of() : List.copyOf(medications);
        }
    }

    public record MedicationPreflight(Long lineId, Long medicationId, Long catalogItemId, Long packageId,
                                      String medicationCode, String medicationName, String productName,
                                      String status, List<PreflightCheck> checks) {
        public MedicationPreflight {
            checks = checks == null ? List.of() : List.copyOf(checks);
        }
    }

    public record PreflightCheck(String code, String status, String message) {}

    public record EvaluationBoundary(String status, String message) {}

    @io.swagger.v3.oas.annotations.media.Schema(name = "ClinicalAssistantDraft")
    public record Draft(
            @Size(max = 1000) String chiefComplaint,
            @Size(max = 4000) String presentIllness,
            @Size(max = 4000) String medicalHistory,
            @Size(max = 4000) String physicalExam,
            @Size(max = 4000) String treatmentPlan,
            @Min(40) @Max(300) Integer systolic,
            @Min(20) @Max(200) Integer diastolic,
            @DecimalMin("30.0") @DecimalMax("45.0") BigDecimal temperature,
            @Min(20) @Max(250) Integer pulseRate,
            @Min(5) @Max(80) Integer respiratoryRate,
            @Min(50) @Max(100) Integer oxygenSaturation,
            @DecimalMin("20") @DecimalMax("250") BigDecimal heightCm,
            @DecimalMin("0.1") @DecimalMax("500") BigDecimal weightKg,
            @Size(max = 20) List<@NotNull @Valid DiagnosisInput> diagnoses,
            @Size(max = 4000) String allergyHistory, @Size(max = 4000) String medicationHistory,
            @Size(max = 4000) String auxiliaryExaminations, @Size(max = 4000) String healthEducation, @Size(max = 4000) String followUp,
            @Size(max = 200) List<RecordAnnotation> annotations) {
        public Draft(String chiefComplaint, String presentIllness, String medicalHistory, String physicalExam,
                     String treatmentPlan, Integer systolic, Integer diastolic, BigDecimal temperature,
                     Integer pulseRate, Integer respiratoryRate, Integer oxygenSaturation,
                     BigDecimal heightCm, BigDecimal weightKg, List<DiagnosisInput> diagnoses,
                     String allergyHistory, String medicationHistory, String auxiliaryExaminations,
                     String healthEducation, String followUp) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan, systolic, diastolic,
                    temperature, pulseRate, respiratoryRate, oxygenSaturation, heightCm, weightKg, diagnoses,
                    allergyHistory, medicationHistory, auxiliaryExaminations, healthEducation, followUp, List.of());
        }
        public java.util.Map<String, String> writingFields() {
            var fields = new java.util.LinkedHashMap<String, String>();
            fields.put("chiefComplaint", chiefComplaint); fields.put("presentIllness", presentIllness);
            fields.put("medicalHistory", medicalHistory); fields.put("physicalExam", physicalExam);
            fields.put("allergyHistory", allergyHistory); fields.put("medicationHistory", medicationHistory);
            fields.put("auxiliaryExaminations", auxiliaryExaminations); fields.put("healthEducation", healthEducation);
            fields.put("followUp", followUp);
            return fields;
        }
        public Draft evidence() {
            var fields = RecordAnnotation.evidence(writingFields(), annotations);
            return new Draft(fields.get("chiefComplaint"), fields.get("presentIllness"), fields.get("medicalHistory"),
                    fields.get("physicalExam"), treatmentPlan, systolic, diastolic, temperature, pulseRate,
                    respiratoryRate, oxygenSaturation, heightCm, weightKg, diagnoses, fields.get("allergyHistory"),
                    fields.get("medicationHistory"), fields.get("auxiliaryExaminations"), fields.get("healthEducation"),
                    fields.get("followUp"), List.of());
        }
        public Draft(String chiefComplaint, String presentIllness, String medicalHistory, String physicalExam,
                     String treatmentPlan, Integer systolic, Integer diastolic, BigDecimal temperature,
                     Integer pulseRate, Integer respiratoryRate, Integer oxygenSaturation,
                     BigDecimal heightCm, BigDecimal weightKg, List<DiagnosisInput> diagnoses) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan, systolic, diastolic,
                    temperature, pulseRate, respiratoryRate, oxygenSaturation, heightCm, weightKg, diagnoses,
                    null, null, null, null, null);
        }
        public Draft(String chiefComplaint, String presentIllness, String medicalHistory, String physicalExam,
                     String treatmentPlan, Integer systolic, Integer diastolic, BigDecimal temperature,
                     Integer pulseRate, Integer respiratoryRate, Integer oxygenSaturation, List<DiagnosisInput> diagnoses) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan, systolic, diastolic,
                    temperature, pulseRate, respiratoryRate, oxygenSaturation, null, null, diagnoses);
        }
        public Draft {
            annotations = annotations == null ? List.of() : List.copyOf(annotations);
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
        }
    }

    @io.swagger.v3.oas.annotations.media.Schema(name = "ClinicalAssistantDiagnosisInput")
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record DiagnosisInput(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String display,
            @NotBlank @Pattern(regexp = "PRIMARY|SECONDARY") String type,
            @jakarta.validation.constraints.Positive @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Long conceptId,
            @Size(max = 128) @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String codeSystem,
            @Pattern(regexp = "WESTERN_MEDICINE|TCM_DISEASE|TCM_SYNDROME")
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) String diagnosisDomain) {
        public DiagnosisInput(String code, String display, String type) { this(code, display, type, null, null, null); }
    }

    public record EventRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Pattern(regexp = "VIEWED|ADOPTED|IGNORED|FEEDBACK_POSITIVE|FEEDBACK_NEGATIVE")
            String eventType,
            @Size(max = 64) String sectionCode,
            @NotBlank @Size(max = 128) String contextHash,
            @Size(max = 1000) String detail) {}

    public record Suggestion(
            Long id, Long parentSuggestionId, String status, String contextHash, String clientContextFingerprint,
            String provider, String model, String promptVersion, Instant generatedAt, Instant expiresAt,
            String summary, RecordDraft recordDraft,
            List<DiagnosisCandidate> diagnosisCandidates,
            List<DiagnosisCandidate> differentialDiagnoses,
            List<String> missingInformation,
            List<SafetyAlert> safetyAlerts,
            List<RecommendedPlan> recommendedPlans,
            String disclaimer, List<TreatmentRecommendation> treatmentRecommendations) {}

    public record RecordDraft(String chiefComplaint, String presentIllness, String medicalHistory,
                              String physicalExam, String treatmentPlan,
                              BigDecimal temperature, BigDecimal pulseRate, BigDecimal respiratoryRate,
                              BigDecimal systolic, BigDecimal diastolic, BigDecimal oxygenSaturation,
                              BigDecimal heightCm, BigDecimal weightKg,
                              String allergyHistory, String medicationHistory, String auxiliaryExaminations, String healthEducation, String followUp,
                              List<com.rhn.outpatient.api.RecordAnnotation> annotations) {
        public RecordDraft(String chiefComplaint, String presentIllness, String medicalHistory, String physicalExam,
                           String treatmentPlan, BigDecimal temperature, BigDecimal pulseRate, BigDecimal respiratoryRate,
                           BigDecimal systolic, BigDecimal diastolic, BigDecimal oxygenSaturation, BigDecimal heightCm,
                           BigDecimal weightKg, String allergyHistory, String medicationHistory, String auxiliaryExaminations,
                           String healthEducation, String followUp) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan, temperature, pulseRate,
                    respiratoryRate, systolic, diastolic, oxygenSaturation, heightCm, weightKg, allergyHistory,
                    medicationHistory, auxiliaryExaminations, healthEducation, followUp, List.of());
        }
        public RecordDraft(String chiefComplaint, String presentIllness, String medicalHistory,
                           String physicalExam, String treatmentPlan, BigDecimal temperature, BigDecimal pulseRate,
                           BigDecimal respiratoryRate, BigDecimal systolic, BigDecimal diastolic,
                           BigDecimal oxygenSaturation, BigDecimal heightCm, BigDecimal weightKg) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan, temperature,
                    pulseRate, respiratoryRate, systolic, diastolic, oxygenSaturation, heightCm, weightKg,
                    null, null, null, null, null);
        }
        public RecordDraft(String chiefComplaint, String presentIllness, String medicalHistory,
                           String physicalExam, String treatmentPlan) {
            this(chiefComplaint, presentIllness, medicalHistory, physicalExam, treatmentPlan,
                    null, null, null, null, null, null, null, null);
        }
    }

    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record DiagnosisCandidate(String code, String display, String type,
                                     double confidence, String rationale) {}

    public record SafetyAlert(String level, String title, String detail) {}

    public record RecommendedPlan(Long templateId, String name, String description, String rationale) {}

    /** The initial pass supplies type/name search intents; only catalog-mapped items reach clients. */
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record TreatmentRecommendation(String type, Long catalogItemId, Long medicationId,
                                          String code, String name, String specification, String rationale) {}

    public record SuggestionContent(
            String summary, RecordDraft recordDraft,
            List<DiagnosisCandidate> diagnosisCandidates,
            List<DiagnosisCandidate> differentialDiagnoses,
            List<String> missingInformation,
            List<SafetyAlert> safetyAlerts,
            List<RecommendedPlan> recommendedPlans,
            String disclaimer, List<TreatmentRecommendation> treatmentRecommendations) {
        public SuggestionContent(String summary, RecordDraft recordDraft, List<DiagnosisCandidate> diagnosisCandidates,
                                 List<DiagnosisCandidate> differentialDiagnoses, List<String> missingInformation,
                                 List<SafetyAlert> safetyAlerts, List<RecommendedPlan> recommendedPlans, String disclaimer) {
            this(summary, recordDraft, diagnosisCandidates, differentialDiagnoses, missingInformation,
                    safetyAlerts, recommendedPlans, disclaimer, List.of());
        }
        public SuggestionContent {
            diagnosisCandidates = safe(diagnosisCandidates);
            differentialDiagnoses = safe(differentialDiagnoses);
            missingInformation = safe(missingInformation);
            safetyAlerts = safe(safetyAlerts);
            recommendedPlans = safe(recommendedPlans);
            treatmentRecommendations = safe(treatmentRecommendations);
        }

        private static <T> List<T> safe(List<T> values) {
            return values == null ? List.of() : List.copyOf(values);
        }
    }

    /** Catalog-validated read-only preview. No suggestion identity exists until generation commits. */
    public record GenerationStage(String phase, String clientContextFingerprint, SuggestionContent content) {}

    public record Event(Long id, String eventType, String statusFrom, String statusTo,
                        String commandCode, String sectionCode, String contextHash,
                        String detail, Instant occurredAt) {}

    public record CompilePlanDraftRequest(
            @NotBlank @Size(max = 2000) String naturalInput,
            @NotBlank @Size(max = 16) String scopeType,
            @Size(max = 4000) String confirmedNarrative,
            @Size(max = 1000) String revisionInstruction,
            @Size(max = 100) String confirmedName,
            @Size(max = 30) List<@Valid PlanReviewItem> reviewItems) {
        public CompilePlanDraftRequest(String naturalInput, String scopeType, String confirmedNarrative) {
            this(naturalInput, scopeType, confirmedNarrative, null, null, null);
        }
    }

    public record CompileGuidelinePlanRequest(
            @NotBlank @Size(max = 10000) String guidelineText,
            @NotBlank @Size(max = 200) String guidelineName,
            @Size(max = 32) String versionYear,
            @Size(max = 16) String scopeType,
            @Size(max = 4000) String confirmedNarrative,
            @Size(max = 1000) String revisionInstruction) {
        public CompileGuidelinePlanRequest(String guidelineText, String guidelineName, String versionYear,
                                           String scopeType, String confirmedNarrative) {
            this(guidelineText, guidelineName, versionYear, scopeType, confirmedNarrative, null);
        }
    }

    /** Human-readable AI draft shown before the doctor authorizes structured conversion. */
    public record PlanReviewItem(
            @NotBlank @Size(max = 32) String kind,
            @NotBlank @Size(max = 300) String text,
            @Size(max = 500) String sourceQuote,
            @NotBlank @Size(max = 16) String origin,
            @Size(max = 500) String details) {}

    public record PlanTextDraft(String scopeType, String name, String narrative,
                                String sourceType, String guidelineReference,
                                List<PlanReviewItem> reviewItems, java.util.Map<String, String> noteTemplateContent,
                                List<com.rhn.outpatient.api.RecordAnnotation> recordAnnotations) {
        public PlanTextDraft(String scopeType, String name, String narrative, String sourceType,
                             String guidelineReference, List<PlanReviewItem> reviewItems, java.util.Map<String, String> noteTemplateContent) {
            this(scopeType, name, narrative, sourceType, guidelineReference, reviewItems, noteTemplateContent, List.of());
        }
        public PlanTextDraft(String scopeType, String name, String narrative, String sourceType,
                             String guidelineReference, List<PlanReviewItem> reviewItems) {
            this(scopeType, name, narrative, sourceType, guidelineReference, reviewItems, java.util.Map.of());
        }
        public PlanTextDraft {
            reviewItems = reviewItems == null ? List.of() : List.copyOf(reviewItems);
        }
    }

    public record MinedPlanSuggestionView(
            String patternKey,
            String suggestedName,
            String description,
            long occurrenceCount,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput> diagnoses,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput> medications,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput> services) {}

    public record HistoricalStablePlanView(
            Long encounterId,
            Long sourceEncounterId,
            Instant sourceEncounterTime,
            String conditionTitle,
            String summary,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput> diagnoses,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput> medications,
            List<com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput> services,
            List<String> guidanceNotes,
            @jakarta.validation.constraints.NotNull List<HistoricalPlanReviewItem> reviewItems,
            @jakarta.validation.constraints.NotNull java.util.Set<String> assessedCategories) {
        public HistoricalStablePlanView {
            reviewItems = List.copyOf(reviewItems);
            assessedCategories = java.util.Set.copyOf(assessedCategories);
        }
    }

    /** Original historical records that have not been admitted to executable draft inputs. */
    public record HistoricalPlanReviewItem(String category, Long sourceId, Long medicationId,
                                           Long catalogItemId, String code, String display, String reason) {}

    public record HistoricalPlanComparisonView(
            HistoricalStablePlanView historicalPlan,
            com.rhn.outpatient.api.OutpatientPlanTemplateDirectory.PlanTemplateSnapshot standardPlan,
            List<PlanDifferenceView> differences) {}

    public record PlanDifferenceView(
            String key, String category, String status,
            Integer historicalIndex, Integer standardIndex,
            String historicalDisplay, String standardDisplay,
            String reason) {}

    public record EvidenceChainQuery(
            @Size(max = 200) String diagnosis,
            @Size(max = 64) String diagnosisCode,
            @Size(max = 1000) String chiefComplaint,
            @Size(max = 5000) String presentIllness,
            @Size(max = 2000) String physicalExam,
            @Size(max = 2000) String medicalHistory,
            java.util.Map<String, Object> vitals
    ) {
        public EvidenceChainQuery(String diagnosis, String diagnosisCode, String chiefComplaint,
                                  String presentIllness, String medicalHistory, java.util.Map<String, Object> vitals) {
            this(diagnosis, diagnosisCode, chiefComplaint, presentIllness, null, medicalHistory, vitals);
        }
    }

    public record WikiDocQuery(
            @Size(max = 200) String name,
            @Size(max = 200) String id,
            @Size(max = 500) String path,
            @Size(max = 50) String type
    ) {}
}
