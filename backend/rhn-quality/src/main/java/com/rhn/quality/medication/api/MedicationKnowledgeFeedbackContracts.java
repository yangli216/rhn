package com.rhn.quality.medication.api;

import com.rhn.shared.api.PageResult;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class MedicationKnowledgeFeedbackContracts {
    private MedicationKnowledgeFeedbackContracts() {}
    public record Basis(Long candidateId,Long deploymentId,Long runId,Long organizationId,Long departmentId,
            String outcome,String runHash,String releaseFingerprint,String programHash,String knowledgeHash,String fingerprint) {}
    public record Event(Long id,int revision,String operation,String verdict,String assessment,String evidence,String suggestion,
            String reason,Basis basis,Long actorId,String actor,Instant time) {}
    public record Command(int expectedRevision,String expectedBasisHash,String operation,String verdict,String assessment,String evidence,String suggestion,String reason) {}
    public record State(Long id,int revision,String operation,String verdict,String actor,Instant time) {}
    public record Summary(long recorded,long pending,Map<String,Long> verdicts) {}
    public record Detail(Basis basis,MedicationKnowledgeDeploymentContracts.Observation observation,
            MedicationKnowledgeReplayContracts.Input input,MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate frozenCandidate,
            List<String> gaps,List<String> allowedVerdicts,Event latest,boolean canWithdraw,PageResult<Event> history) {}
}
