package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Draft knowledge, independent of clinical execution or publication approval. */
public final class MedicationKnowledgeDraftContracts {
    private MedicationKnowledgeDraftContracts() {}
    /** level ENTRY/SPECIFICATION address a standard entry or specification; CATEGORY addresses a catalog classification by categoryKey. */
    public record Target(String level, String specificationId, String catalogId, String catalogVersion, String contentHash, String categoryKey) {
        public Target(String level, String specificationId, String catalogId, String catalogVersion, String contentHash) {this(level,specificationId,catalogId,catalogVersion,contentHash,null);}
    }
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
    /** Frozen expansion of a classification: the member entries as of the referenced catalog edition. */
    public record Category(String key, String label, List<String> entryIds) {
        public Category {entryIds=List.copyOf(entryIds);}
    }
    /** For CATEGORY, reference carries the catalog edition only (no entry/specification) and category the frozen members. */
    public record ResolvedTarget(String level, Reference reference, Category category) {
        public ResolvedTarget(String level, Reference reference) {this(level,reference,null);}
        public boolean byCategory() {return "CATEGORY".equals(level) && category != null;}
        /** True when a prescription row's standard identity falls inside this target (edition checked by the caller). */
        public boolean covers(String entryId, String specificationId) {
            if (byCategory()) return entryId != null && category.entryIds().contains(entryId);
            return java.util.Objects.equals(entryId, reference.entryId()) && ("ENTRY".equals(level) || java.util.Objects.equals(specificationId, reference.specificationId()));
        }
    }
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
