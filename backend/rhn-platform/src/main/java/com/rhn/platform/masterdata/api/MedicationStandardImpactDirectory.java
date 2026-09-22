package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import java.time.Instant;
import java.util.List;

/** Complete stored dependency inventories, supplied by the owning module without publication side effects. */
public interface MedicationStandardImpactDirectory {
    List<Area> capture(List<Scope> scopes);
    record Trace(String relation, String location, String catalogId, String catalogVersion, String entryId,
            String specificationId, String contentHash, String reason) {}
    record Item(String kind, String id, String parentId, String name, String version, String status, boolean historical,
            String matchType, List<Trace> traces, String mode, Long organizationId, Long departmentId,
            Instant effectiveFrom, Instant effectiveTo, String fingerprint) {}
    record Area(Scope scope, List<String> coverage, List<String> limitations, List<Item> dependencies) {}
}
