package com.rhn.quality.medication.api;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import java.time.*;
import java.util.List;

/** Typed, versioned rule expression. Publication authority is deliberately not part of the program. */
public final class MedicationKnowledgeRuleContracts {
    private MedicationKnowledgeRuleContracts() {}
    public enum Operator { SAME_STANDARD_ENTRY, EXPLICIT_GROUP, GROUP_PAIR }
    public enum RangeMode { ALL, LIST }
    public enum AgeMode { ALL, RANGE }
    public record Group(List<ResolvedTarget> targets,RangeMode routeMode,List<RouteSnapshot> routes) {
        public Group {targets=List.copyOf(targets);routes=List.copyOf(routes);}
    }
    public record Age(AgeMode mode,String unit,Integer minimumInclusive,Integer maximumExclusive) {}
    public record Program(String schemaVersion,Operator operator,String exposureScope,Group groupA,Group groupB,
            Integer minimumOrders,Age age,LocalDate effectiveFrom,LocalDate effectiveTo,String proposedAction,List<String> requiredFacts) {
        public Program {requiredFacts=List.copyOf(requiredFacts);}
    }
    public record Preview(boolean ready,Version knowledge,String knowledgeHash,Program program,String programHash,List<Issue> issues,List<TestCase> cases) {}
    public record Create(int expectedKnowledgeVersion,String expectedProgramHash,String reason) {}
    public record KnowledgeRuleCandidate(Long id,Long knowledgeId,int version,Version knowledge,String knowledgeHash,
            Program program,String programHash,List<TestCase> cases,Long actorId,String actor,Instant createdAt,String reason) {}
}
