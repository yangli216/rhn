package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Issue;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Conflict;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.KnowledgeRuleCandidate;
import com.rhn.quality.medication.api.MedicationKnowledgeTestContracts.Run;
import java.time.Instant;
import java.util.List;

public final class MedicationKnowledgeReviewContracts {
    private MedicationKnowledgeReviewContracts() {}
    public record Basis(KnowledgeRuleCandidate candidate,Run validation,List<Conflict> possibleConflicts,String fingerprint) {}
    public record Event(Long id,Long candidateId,String operation,Long submissionId,Basis basis,
            String action,String unavailableAction,boolean standardVerified,boolean evidenceVerified,boolean testsVerified,
            String assessment,Long actorId,String actor,Instant time,String reason) {}
    public record Preview(long revision,String status,Basis current,List<Issue> issues,List<String> gaps,
            Event submission,Event latest,boolean basisUnchanged,List<String> allowedOperations,List<String> reviewerRestrictions) {}
    public record Command(long expectedRevision,String operation,String expectedBasisHash,String reason,
            String action,String unavailableAction,Boolean standardVerified,Boolean evidenceVerified,Boolean testsVerified,String assessment) {}
    public record Summary(Long id,String operation,Long submissionId,String actor,Instant time,String reason) {}
}
