package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Human-authored synthetic fixtures. A passing suite is not clinical approval. */
public final class MedicationKnowledgeTestContracts {
    private MedicationKnowledgeTestContracts() {}
    public record FixtureInput(BigDecimal age,String ageUnit,LocalDate date,List<Row> medications) {}
    public record Case(String title,String rationale,FixtureInput input,String expectedOutcome,List<String> expectedOrderIds,Map<String,String> medicationLabels) {
        public Case(String title,String rationale,FixtureInput input,String expectedOutcome,List<String> expectedOrderIds) {this(title,rationale,input,expectedOutcome,expectedOrderIds,Map.of());}
    }
    public record Save(int expectedVersion,String programHash,String reason,List<Case> cases) {}
    public record Suite(Long candidateId,int version,String programHash,String knowledgeHash,List<Case> cases,
            Long actorId,String actor,Instant createdAt,String reason) {}
    public record SuiteSummary(int version,int caseCount,String actor,Instant createdAt,String reason) {}
    public record SuiteDetail(Suite suite,String suiteHash) {}
    public record Execute(int suiteVersion,String suiteHash,String reason) {}
    public record CaseResult(int index,Result actual,boolean passed) {}
    public record Run(Long id,Long candidateId,String programHash,String knowledgeHash,String engineVersion,
            Suite suite,String suiteHash,List<CaseResult> results,boolean allPassed,List<String> missingOutcomeKinds,
            Long actorId,String actor,Instant createdAt,String reason) {}
    public record RunSummary(Long id,int suiteVersion,int caseCount,int passedCount,boolean allPassed,String actor,Instant createdAt) {}
    public record ValidationStatus(String status,int suiteVersion,Long runId,int caseCount,int passedCount) {}
}
