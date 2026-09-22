package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Draft knowledge, independent of clinical execution or publication approval. */
public final class MedicationKnowledgeDraftContracts {
    private MedicationKnowledgeDraftContracts() {}
    public record Target(String level, String specificationId, String catalogId, String catalogVersion, String contentHash) {}
    public record RouteCondition(String mode, List<String> codes) {}
    public record Conditions(String ageMode, String ageUnit, Integer minimumAgeInclusive, Integer maximumAgeExclusive,
            RouteCondition groupARoutes, RouteCondition groupBRoutes, String additionalConditions) {}
    public record Evidence(String sourceType, String title, String publisher, String edition, String locator, String excerpt,
            String documentHash, LocalDate effectiveFrom, LocalDate effectiveTo) {}
    public record Body(String title, String kind, String matchMode, List<Target> groupA, List<Target> groupB,
            Integer minimumOrders, String exposureScope, Conditions conditions, Evidence evidence,
            String clinicalMeaning, String severity, String proposedAction) {}
    public record Save(Integer expectedVersion, Body body, String changeReason, Long extractionId,Long intakeId) {
        public Save(Integer expectedVersion,Body body,String changeReason,Long extractionId) {this(expectedVersion,body,changeReason,extractionId,null);}
        public Save(Integer expectedVersion, Body body, String changeReason) {this(expectedVersion,body,changeReason,null);}
    }
    public record Issue(String field, String code, String message) {}
    public record ResolvedTarget(String level, Reference reference) {}
    public record Assessment(boolean structureComplete, List<Issue> issues, String ruleDescription,
            List<ResolvedTarget> groupA, List<ResolvedTarget> groupB, List<RouteSnapshot> groupARoutes, List<RouteSnapshot> groupBRoutes) {}
    public record Version(Long id, int version, String status, Body body, Assessment assessment,
            Long actorId, String actor, Instant savedAt, String changeReason, Long extractionId) {
        public Version(Long id, int version, String status, Body body, Assessment assessment, Long actorId, String actor, Instant savedAt, String changeReason) {
            this(id,version,status,body,assessment,actorId,actor,savedAt,changeReason,null);
        }
    }
    public record Conflict(Long id, int version, String title, String reason) {}
    public record Detail(Version saved, Assessment currentAssessment, List<Conflict> possibleConflicts, List<TestCase> cases,Long intakeId) {
        public Detail(Version saved,Assessment currentAssessment,List<Conflict> possibleConflicts,List<TestCase> cases) {this(saved,currentAssessment,possibleConflicts,cases,null);}
    }
    public record Summary(Long id, int version, String title, String kind, boolean structureComplete, Instant savedAt) {}
    public record Facts(Integer age, String ageUnit, LocalDate date, List<Row> medications) {}
    public record Row(String orderId, String catalogId, String catalogVersion, String contentHash, String entryId,
            String specificationId, String routeCode, String status) {}
    public record Result(String outcome, List<String> reasons, List<String> matchedOrderIds) {}
    public record TestCase(String name, Facts input, String expected, Result actual, boolean passed) {}
}
