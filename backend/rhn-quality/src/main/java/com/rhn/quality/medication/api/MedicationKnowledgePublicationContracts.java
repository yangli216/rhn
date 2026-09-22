package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.Event;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class MedicationKnowledgePublicationContracts {
    private MedicationKnowledgePublicationContracts() {}
    public record Observation(Long runId,String runHash,String outcome,Instant time,MedicationKnowledgeFeedbackContracts.Event feedback) {}
    public record Basis(String operation,Long sourceDeploymentId,Long shadowDeploymentId,Long throughRunId,
            Event approval,List<Observation> observations,Map<String,Long> outcomes,String fingerprint) {}
    public record Preview(long revision,Long candidateId,Long organizationId,Long departmentId,Basis basis,List<String> gaps,List<String> notices,List<Deployment> formalDeployments) {}
    public record Command(long expectedRevision,String operation,Long sourceDeploymentId,Long throughRunId,String expectedFingerprint,
            Instant effectiveTo,String assessment,String rollbackPlan,String reason,boolean observationsConfirmed,boolean actionsConfirmed,boolean rollbackConfirmed) {}
    public record Authorization(Long id,Long tenantId,Long deploymentId,Long candidateId,Long organizationId,Long departmentId,
            Basis basis,String assessment,String rollbackPlan,String reason,Long actorId,String actor,Instant time) {}
}
