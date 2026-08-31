package com.rhn.ai.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class ClinicalAssistantContracts {
    private ClinicalAssistantContracts() {}

    public record Capabilities(String mode, boolean available, String provider, String model,
                               String message, List<String> features) {
        public Capabilities {
            features = features == null ? List.of() : List.copyOf(features);
        }
    }

    public record GenerateRequest(
            @NotBlank @Size(max = 128) String clientContextFingerprint,
            @Size(max = 500) String question,
            @NotNull @Valid Draft draft) {}

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
            @Size(max = 20) List<@NotNull @Valid DiagnosisInput> diagnoses) {
        public Draft {
            diagnoses = diagnoses == null ? List.of() : List.copyOf(diagnoses);
        }
    }

    public record DiagnosisInput(
            @NotBlank @Size(max = 64) String code,
            @NotBlank @Size(max = 200) String display,
            @NotBlank @Pattern(regexp = "PRIMARY|SECONDARY") String type) {}

    public record EventRequest(
            @NotBlank @Size(max = 128) String commandCode,
            @NotBlank @Pattern(regexp = "VIEWED|ADOPTED|IGNORED|FEEDBACK_POSITIVE|FEEDBACK_NEGATIVE")
            String eventType,
            @Size(max = 64) String sectionCode,
            @NotBlank @Size(max = 128) String contextHash,
            @Size(max = 1000) String detail) {}

    public record Suggestion(
            Long id, String status, String contextHash, String clientContextFingerprint,
            String provider, String model, Instant generatedAt, Instant expiresAt,
            String summary, RecordDraft recordDraft,
            List<DiagnosisCandidate> diagnosisCandidates,
            List<DiagnosisCandidate> differentialDiagnoses,
            List<String> missingInformation,
            List<SafetyAlert> safetyAlerts,
            List<RecommendedPlan> recommendedPlans,
            String disclaimer) {}

    public record RecordDraft(String chiefComplaint, String presentIllness, String medicalHistory,
                              String physicalExam, String treatmentPlan) {}

    public record DiagnosisCandidate(String code, String display, String type,
                                     double confidence, String rationale) {}

    public record SafetyAlert(String level, String title, String detail) {}

    public record RecommendedPlan(Long templateId, String name, String description, String rationale) {}

    public record SuggestionContent(
            String summary, RecordDraft recordDraft,
            List<DiagnosisCandidate> diagnosisCandidates,
            List<DiagnosisCandidate> differentialDiagnoses,
            List<String> missingInformation,
            List<SafetyAlert> safetyAlerts,
            List<RecommendedPlan> recommendedPlans,
            String disclaimer) {
        public SuggestionContent {
            diagnosisCandidates = safe(diagnosisCandidates);
            differentialDiagnoses = safe(differentialDiagnoses);
            missingInformation = safe(missingInformation);
            safetyAlerts = safe(safetyAlerts);
            recommendedPlans = safe(recommendedPlans);
        }

        private static <T> List<T> safe(List<T> values) {
            return values == null ? List.of() : List.copyOf(values);
        }
    }

    public record Event(Long id, String eventType, String statusFrom, String statusTo,
                        String commandCode, String sectionCode, String contextHash,
                        String detail, Instant occurredAt) {}
}
