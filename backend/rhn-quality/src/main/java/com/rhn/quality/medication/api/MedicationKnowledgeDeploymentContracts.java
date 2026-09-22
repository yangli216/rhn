package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationRuleCatalogContracts.Deployment;
import com.rhn.quality.medication.api.MedicationKnowledgeReviewContracts.Event;
import com.rhn.shared.api.PageResult;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class MedicationKnowledgeDeploymentContracts {
    private MedicationKnowledgeDeploymentContracts() {}
    public record Release(Event approval,String factAdapterVersion,String fingerprint,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) Long authorizationId) {
        public Release(Event approval,String factAdapterVersion,String fingerprint) {this(approval,factAdapterVersion,fingerprint,null);}
    }
    public record Preview(long revision,Long organizationId,Long departmentId,Event approval,List<String> gaps,List<Deployment> deployments) {}
    public record Command(long expectedRevision,String operation,String mode,String expectedBasisHash,Long deploymentId,Instant effectiveTo,String reason) {}
    public record Observation(Long id,Long deploymentId,Long prescriptionId,Instant time,String outcome,List<String> reasons,List<String> matchedOrderIds,MedicationKnowledgeFeedbackContracts.State feedback) {
        public Observation(Long id,Long deploymentId,Long prescriptionId,Instant time,String outcome,List<String> reasons,List<String> matchedOrderIds) {this(id,deploymentId,prescriptionId,time,outcome,reasons,matchedOrderIds,null);}
    }
    public record Observations(Long organizationId,Long departmentId,Map<String,Long> counts,PageResult<Observation> records,MedicationKnowledgeFeedbackContracts.Summary feedback) {}
}
