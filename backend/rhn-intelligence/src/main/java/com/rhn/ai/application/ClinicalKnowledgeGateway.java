package com.rhn.ai.application;

import java.util.List;
import java.util.Map;

/** Read-only boundary for an institution-approved medical knowledge service. */
public interface ClinicalKnowledgeGateway {
    List<KnowledgeResult> search(String query, int limit, ClinicalAssistantSettings runtimeSettings);

    EvidenceChainResult evaluateEvidenceChain(EvidenceChainRequest request, ClinicalAssistantSettings runtimeSettings);

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
}
