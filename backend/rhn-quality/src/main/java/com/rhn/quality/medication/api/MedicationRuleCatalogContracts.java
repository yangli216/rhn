package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationWorkbenchContracts.*;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.outpatient.api.MedicationSafetyDecision.Evidence;
import java.time.Instant;
import java.util.List;

public final class MedicationRuleCatalogContracts {
    private MedicationRuleCatalogContracts() {}
    public record Catalog(Long organizationId, Long departmentId, List<CatalogEntry> rules) {}
    public record CatalogEntry(String key, String code, String name, String origin, long revision,
            List<CatalogVersion> versions, List<Deployment> deployments, List<AuditEvent> history) {}
    public record CatalogVersion(String id, int version, String name, String reviewStatus, boolean testsPassed,
            String origin, Candidate candidate, RuleVersion builtin, Review review,
            MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate knowledgeCandidate,
            MedicationKnowledgeTestContracts.ValidationStatus manualValidation) {
        public CatalogVersion(String id,int version,String name,String reviewStatus,boolean testsPassed,
                String origin,Candidate candidate,RuleVersion builtin,Review review) {
            this(id,version,name,reviewStatus,testsPassed,origin,candidate,builtin,review,null,null);
        }
    }
    public record Review(String versionId, String status, String action, List<Evidence> evidence,
            boolean standardVerified, boolean evidenceVerified, Long actorId, Instant recordedAt, String reason,Long knowledgeReviewId) {
        public Review(String versionId,String status,String action,List<Evidence> evidence,boolean standardVerified,boolean evidenceVerified,Long actorId,Instant recordedAt,String reason) {
            this(versionId,status,action,evidence,standardVerified,evidenceVerified,actorId,recordedAt,reason,null);
        }
    }
    public record Deployment(Long id, String versionId, int version, String mode, String status, String action,
            Long organizationId, Long departmentId, Instant effectiveFrom, Instant effectiveTo,
            Long actorId, Instant createdAt, String reason, Candidate candidate, RuleVersion executable, MedicationKnowledgeDeploymentContracts.Release knowledgeRelease) {
        public Deployment(Long id,String versionId,int version,String mode,String status,String action,Long organizationId,Long departmentId,Instant effectiveFrom,Instant effectiveTo,Long actorId,Instant createdAt,String reason,Candidate candidate,RuleVersion executable) {
            this(id,versionId,version,mode,status,action,organizationId,departmentId,effectiveFrom,effectiveTo,actorId,createdAt,reason,candidate,executable,null);
        }
    }
    public record AuditEvent(Long id, String operation, String versionId, Long actorId, Instant time, String reason) {}
    public record Governance(List<Review> reviews, List<Deployment> deployments, List<AuditEvent> history) {
        public static Governance empty() { return new Governance(List.of(),List.of(),List.of()); }
    }
    public record CatalogCommand(long expectedRevision, String operation, String versionId, Long deploymentId,
            String reason, String action, List<Evidence> evidence, Boolean standardVerified, Boolean evidenceVerified,
            String mode, Long organizationId, Long departmentId, Instant effectiveFrom, Instant effectiveTo) {}
    public record DraftCommand(Long parentId, String requirement, String source, RuleSpec rule, List<Long> medicationIds) {}
    public record RuntimeRecord(Long id, String ruleKey, String versionId, Long deploymentId, Long prescriptionId,
            String mode, String decision, Instant time, String details,Long organizationId,Long departmentId,
            MedicationKnowledgeDraftContracts.Result knowledgeResult) {
        public RuntimeRecord(Long id,String ruleKey,String versionId,Long deploymentId,Long prescriptionId,String mode,String decision,Instant time,String details) {
            this(id,ruleKey,versionId,deploymentId,prescriptionId,mode,decision,time,details,null,null,null);
        }
    }
}
