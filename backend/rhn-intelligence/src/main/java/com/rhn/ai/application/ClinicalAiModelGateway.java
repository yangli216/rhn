package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentRecommendation;
import com.rhn.ai.api.ClinicalAssistantContracts.ReceptionScene;
import com.rhn.ai.api.ClinicalAssistantContracts.ReceptionSceneContext;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;

import java.util.List;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Provider-neutral model boundary. Implementations may call a remote model but never clinical write services. */
public interface ClinicalAiModelGateway {
    SuggestionContent analyze(ModelRequest request, ClinicalAssistantSettings runtimeSettings);

    /** Extracts plan intent only. Catalog identifiers and executable orders are resolved by the application. */
    PlanIntent compilePlan(PlanInput request, ClinicalAssistantSettings runtimeSettings);

    default PlanIntent compilePlanStreaming(PlanInput request, ClinicalAssistantSettings runtimeSettings,
                                            java.util.function.Consumer<String> onDelta) {
        return compilePlan(request, runtimeSettings);
    }

    record PlanInput(String promptVersion, String mode, String text, List<PlanCandidate> availablePlans,
                     String currentNarrative, String revisionInstruction) {
        public PlanInput {
            availablePlans = availablePlans == null ? List.of() : List.copyOf(availablePlans);
            currentNarrative = currentNarrative == null ? "" : currentNarrative.trim();
            revisionInstruction = revisionInstruction == null ? "" : revisionInstruction.trim();
        }
        public PlanInput(String promptVersion, String mode, String text, List<PlanCandidate> availablePlans) {
            this(promptVersion, mode, text, availablePlans, "", "");
        }
        public PlanInput(String promptVersion, String mode, String text) {
            this(promptVersion, mode, text, List.of(), "", "");
        }
    }

    record PlanCandidate(Long id, String name, String description, List<String> diagnoses,
                         List<String> medications, List<String> services, List<String> tasks) {}

    record PlanIntent(String name, String description, String narrative,
                      List<PlanIntentItem> items, Long referenceTemplateId) {
        public PlanIntent {
            items = items == null ? List.of() : List.copyOf(items);
        }
        public PlanIntent(String name, String description, List<PlanIntentItem> items, Long referenceTemplateId) {
            this(name, description, null, items, referenceTemplateId);
        }
        public PlanIntent(String name, String description, List<PlanIntentItem> items) {
            this(name, description, null, items, null);
        }
    }

    record PlanIntentItem(String kind, String name, String sourceQuote, String origin, String details) {}

    default SuggestionContent analyzeStreaming(ModelRequest request, ClinicalAssistantSettings runtimeSettings,
                                              java.util.function.Consumer<String> onDelta) {
        return analyze(request, runtimeSettings);
    }

    /** One server clock reading shared by both generation stages; never included in adoption freshness hashes. */
    record TemporalContext(Instant currentTime, Instant encounterRegisteredAt) {
        public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
        public LocalDate currentDate() { return currentTime.atZone(ZONE).toLocalDate(); }
        public LocalDate encounterDate() {
            return encounterRegisteredAt == null ? null : encounterRegisteredAt.atZone(ZONE).toLocalDate();
        }
    }

    record ModelRequest(
            String promptVersion,
            String question,
            String voiceTranscript,
            Draft draft,
            ResidentDirectory.ResidentSnapshot resident,
            List<AllergyDirectory.AllergySnapshot> allergies,
            List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> availablePlans,
            List<DiagnosticReportResponse> diagnosticReports,
            List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory,
            SuggestionContent priorSuggestion,
            ReceptionScene receptionScene,
            ReceptionSceneContext receptionSceneContext,
            String generationStage, List<TreatmentRecommendation> availableTreatments,
            TemporalContext temporalContext) {
        public ModelRequest(String promptVersion, String question, String voiceTranscript, Draft draft,
                            ResidentDirectory.ResidentSnapshot resident, List<AllergyDirectory.AllergySnapshot> allergies,
                            List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> availablePlans,
                            List<DiagnosticReportResponse> diagnosticReports,
                            List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory,
                            SuggestionContent priorSuggestion, ReceptionScene receptionScene, ReceptionSceneContext receptionSceneContext) {
            this(promptVersion, question, voiceTranscript, draft, resident, allergies, availablePlans, diagnosticReports,
                    clinicalHistory, priorSuggestion, receptionScene, receptionSceneContext, "RECORD_DIAGNOSIS", List.of(),
                    new TemporalContext(Instant.now(), null));
        }
        public ModelRequest(String promptVersion, String question, String voiceTranscript, Draft draft,
                            ResidentDirectory.ResidentSnapshot resident,
                            List<AllergyDirectory.AllergySnapshot> allergies,
                            List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> availablePlans,
                            List<DiagnosticReportResponse> diagnosticReports,
                            List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory,
                            SuggestionContent priorSuggestion) {
            this(promptVersion, question, voiceTranscript, draft, resident, allergies, availablePlans,
                    diagnosticReports, clinicalHistory, priorSuggestion, null, null);
        }
        public ModelRequest {
            java.util.Objects.requireNonNull(temporalContext);
            availableTreatments = availableTreatments == null ? List.of() : List.copyOf(availableTreatments);
            allergies = allergies == null ? List.of() : List.copyOf(allergies);
            availablePlans = availablePlans == null ? List.of() : List.copyOf(availablePlans);
            diagnosticReports = diagnosticReports == null ? List.of() : List.copyOf(diagnosticReports);
            clinicalHistory = clinicalHistory == null ? List.of() : List.copyOf(clinicalHistory);
        }
        public ModelRequest withTemporalContext(TemporalContext value) {
            return new ModelRequest(promptVersion, question, voiceTranscript, draft, resident, allergies,
                    availablePlans, diagnosticReports, clinicalHistory, priorSuggestion, receptionScene,
                    receptionSceneContext, generationStage, availableTreatments, value);
        }
    }
}
