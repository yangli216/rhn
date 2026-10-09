package com.rhn.ai.application;

import java.util.List;
import java.util.Map;

/** Read-only boundary for an institution-approved medical knowledge service. */
public interface ClinicalKnowledgeGateway {
    List<KnowledgeResult> search(String query, int limit, ClinicalAssistantSettings runtimeSettings);

    EvidenceChainResult evaluateEvidenceChain(EvidenceChainRequest request, ClinicalAssistantSettings runtimeSettings);

    PreflightSafetyResult evaluatePreflightSafety(PreflightSafetyRequest request, ClinicalAssistantSettings runtimeSettings);

    WikiDocResult lookupWikiDoc(String query, String docType, ClinicalAssistantSettings runtimeSettings);

    record KnowledgeResult(String id, String title, String excerpt, Double score,
                           String sourceName, String sourceId, String publishYear,
                           String resourcePosition) {}

    record EvidenceChainRequest(
            String diagnosis,
            String diagnosisCode,
            PatientContext patient
    ) {
        public record PatientContext(
                Integer age,
                String gender,
                String chiefComplaint,
                String presentIllness,
                String physicalExam,
                String medicalHistory,
                Map<String, Object> vitals
        ) {
            public PatientContext(Integer age, String gender, String chiefComplaint, String presentIllness,
                                  String medicalHistory, Map<String, Object> vitals) {
                this(age, gender, chiefComplaint, presentIllness, null, medicalHistory, vitals);
            }
        }
    }

    record EvidenceChainResult(
            boolean success,
            String protocolId,
            String protocolTitle,
            DiagnosisRef diagnosis,
            String summary,
            List<Checkpoint> checkpoints,
            List<GapOrder> gapOrders,
            List<GuidelineRef> guidelines
    ) {
        public record DiagnosisRef(String code, String name) {}

        public record Checkpoint(
                String status,
                String type,
                String label,
                String detail,
                String sourceQuote
        ) {}

        public record GapOrder(
                String id,
                String name,
                String category,
                String orderType,
                String dept,
                String spec,
                String indication,
                boolean defaultChecked
        ) {}

        public record GuidelineRef(
                String id,
                String title,
                String chapter,
                String authority,
                String publishYear,
                String docPath,
                List<String> keyExcerpts
        ) {}
    }

    record WikiDocResult(
            String id,
            String title,
            String type,
            String category,
            String genericName,
            String englishName,
            String atcCode,
            String approvalCategory,
            List<String> tradeNames,
            List<String> formsAndSpecs,
            String maxDailyDose,
            String standardMaintenanceDose,
            List<String> keyContraindications,
            Map<String, Object> specialPopulations,
            String storage,
            List<String> sources,
            List<String> tags,
            String relPath,
            String markdown,
            String html
    ) {}

    record PreflightSafetyRequest(
            List<MedicationItem> medications,
            Map<String, Object> patientContext
    ) {
        public PreflightSafetyRequest {
            medications = medications == null ? List.of() : List.copyOf(medications);
            patientContext = patientContext == null ? Map.of() : Map.copyOf(patientContext);
        }

        public record MedicationItem(
                String name,
                String medicationCode,
                Map<String, Object> orderDraft
        ) {
            public MedicationItem(String name) {
                this(name, null, null);
            }
        }
    }

    record PreflightSafetyResult(
            boolean success,
            Boolean canPrescribe,
            String level,
            String summary,
            int blockingCount,
            int warningCount,
            Boundaries evaluationBoundaries,
            List<CheckItem> preflightChecks,
            List<SafetyAlert> allAlerts
    ) {
        public PreflightSafetyResult {
            preflightChecks = preflightChecks == null ? List.of() : List.copyOf(preflightChecks);
            allAlerts = allAlerts == null ? List.of() : List.copyOf(allAlerts);
        }

        public record Boundaries(
                BoundaryItem interactions,
                BoundaryItem contraindications,
                BoundaryItem dosageLimits
        ) {}

        public record BoundaryItem(
                String status,
                String evaluationCode,
                String message,
                List<SafetyAlert> alerts
        ) {
            public BoundaryItem {
                alerts = alerts == null ? List.of() : List.copyOf(alerts);
            }
        }

        public record CheckItem(
                String code,
                String status,
                String title,
                String message,
                List<SafetyAlert> alerts
        ) {
            public CheckItem {
                alerts = alerts == null ? List.of() : List.copyOf(alerts);
            }
        }

        public record SafetyAlert(
                String ruleId,
                String severity,
                String title,
                String message,
                String guideline
        ) {}
    }
}

