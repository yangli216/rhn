package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.Draft;
import com.rhn.ai.api.ClinicalAssistantContracts.SuggestionContent;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;

import java.util.List;

/** Provider-neutral model boundary. Implementations may call a remote model but never clinical write services. */
public interface ClinicalAiModelGateway {
    SuggestionContent analyze(ModelRequest request, ClinicalAssistantSettings runtimeSettings);

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
            SuggestionContent priorSuggestion) {
        public ModelRequest {
            allergies = allergies == null ? List.of() : List.copyOf(allergies);
            availablePlans = availablePlans == null ? List.of() : List.copyOf(availablePlans);
            diagnosticReports = diagnosticReports == null ? List.of() : List.copyOf(diagnosticReports);
            clinicalHistory = clinicalHistory == null ? List.of() : List.copyOf(clinicalHistory);
        }
    }
}
