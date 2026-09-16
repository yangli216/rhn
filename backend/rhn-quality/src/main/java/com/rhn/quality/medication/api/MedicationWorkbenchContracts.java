package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.MedicationKnowledgeDirectory.Knowledge;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public final class MedicationWorkbenchContracts {
    private MedicationWorkbenchContracts() {}
    public record RuleSpec(String template, String name, String explanation, int duplicateCount,
                           String message, String decision) {}
    public record AiReply(String status, String message, RuleSpec rule) {}
    public record Candidate(Long id, Long parentId, int version, String requirement, String source,
                            String model, Instant createdAt, RuleSpec rule, List<Knowledge> medications,
                            String status) {}
    public record Generation(String status, String message, Candidate candidate) {}
    public record GenerateRequest(String requirement, String source, List<Long> medicationIds, Long parentId) {}
    public record TrialItem(Long medicationId, String status, BigDecimal durationDays, String routeCode) {}
    public record TrialRequest(List<TrialItem> items) {}
    public record CaseResult(String name, String expected, String actual, boolean passed,
                             List<Integer> matchedRows, List<String> reasons, List<TrialItem> input) {}
    public record TrialRun(Long id, Long candidateId, String mode, Instant createdAt,
                           Long prescriptionId, String inputHash, List<CaseResult> cases) {}
    public record ShadowRequest(Long encounterId, Long prescriptionId) {}
}
