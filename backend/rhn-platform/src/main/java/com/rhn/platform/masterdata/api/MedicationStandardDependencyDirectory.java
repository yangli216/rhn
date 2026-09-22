package com.rhn.platform.masterdata.api;

import java.util.List;

/** Tenant-scoped stored relationships, including inactive and stale records. No repair side effects. */
public interface MedicationStandardDependencyDirectory {
    Snapshot inspect(Scope scope);
    Snapshot inspectDependencies(Scope scope);
    record Scope(String catalogId, String entryId, String specificationId) {}
    record Reference(String catalogId, String catalogVersion, String entryId, String specificationId, String contentHash) {}
    record Medication(Long id, String code, String name, String status, Long revision, List<Reference> references) {}
    record Product(Long id, Long medicationId, String code, String name, String status, long revision) {}
    record Revision(Long id, Long medicationId, String name, String status, boolean historical, String actor, java.time.Instant recordedAt,
            List<Reference> previous, Reference target, List<Reference> resulting) {}
    record Snapshot(Scope scope, List<Medication> medications, List<Product> products, List<Revision> revisions) {}
}
