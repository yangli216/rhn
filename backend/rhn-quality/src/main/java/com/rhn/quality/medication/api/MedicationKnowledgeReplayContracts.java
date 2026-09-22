package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import java.time.Instant;
import java.util.List;

public final class MedicationKnowledgeReplayContracts {
    private MedicationKnowledgeReplayContracts() {}
    public record Request(int expectedVersion, Long evaluationId) {}
    public record Source(Long evaluationId, Long prescriptionId, Long encounterId, long prescriptionRevision,
            Long organizationId, Long departmentId, Instant evaluatedAt, String inputHash, String originalMode) {}
    public record Route(String conceptId,String code,String system,String version) {}
    public record Item(String orderId,long revision,String originalStatus,String medicationName,
            String semanticVersion,Row fact,Route route,List<String> gaps) {}
    public record Input(Facts facts,List<Item> items,List<String> gaps,String dateBasis) {}
    public record Run(Long id,String engineVersion,Version knowledge,String knowledgeHash,Source source,
            Input input,String inputHash,Result result,List<Issue> currentKnowledgeIssues,
            Long actorId,String actor,Instant createdAt) {}
    public record Summary(Long id,int knowledgeVersion,Long evaluationId,Long prescriptionId,String outcome,String actor,Instant createdAt) {}
}
