package com.rhn.healthcore.api;


/** Public contract exposed by the health-core module to other business modules. */
public interface ResidentDirectory {
    Long resolveCanonicalResidentId(Long residentId);

    ResidentSnapshot requireSnapshot(Long residentId);

    /**
     * Tenant-explicit lookup for background jobs and other system entry points that do not run in an HTTP context.
     */
    ResidentSnapshot requireSnapshot(Long tenantId, Long residentId);

    /**
     * Batch form of {@link #requireSnapshot(Long)} for list/board assembly: keyed by the requested id, with the same
     * errors as the single lookup (any missing or unusable id throws).
     */
    default java.util.Map<Long, ResidentSnapshot> requireSnapshots(java.util.Collection<Long> residentIds) {
        java.util.Map<Long, ResidentSnapshot> result = new java.util.LinkedHashMap<>();
        for (Long id : residentIds) {
            if (id != null && !result.containsKey(id)) result.put(id, requireSnapshot(id));
        }
        return result;
    }

    /** Tenant-explicit batch lookup; see {@link #requireSnapshots(java.util.Collection)}. */
    default java.util.Map<Long, ResidentSnapshot> requireSnapshots(Long tenantId, java.util.Collection<Long> residentIds) {
        java.util.Map<Long, ResidentSnapshot> result = new java.util.LinkedHashMap<>();
        for (Long id : residentIds) {
            if (id != null && !result.containsKey(id)) result.put(id, requireSnapshot(tenantId, id));
        }
        return result;
    }

    /**
     * Returns the canonical resident while holding a write lock for the current transaction.
     * Cross-module workflows use this to serialize creation of resident-scoped authoritative facts.
     */
    ResidentSnapshot requireSnapshotForUpdate(Long residentId);

    /**
     * Exact lookup of an active identifier (NATIONAL_ID, PASSPORT, OTHER or a dictionary system code) in the current
     * tenant; returns the canonical resident. Used by roster imports that match people by identifier.
     */
    java.util.Optional<ResidentSnapshot> findByIdentifier(String identifierSystem, String identifierValue);

    /**
     * Full national ID of the canonical resident, for server-side calls to external verification services only
     * (e.g. medical-insurance authentication). Never return it to browsers; they only receive the masked value.
     */
    default java.util.Optional<String> findNationalId(Long residentId) { return java.util.Optional.empty(); }

    default void requireResident(Long residentId) {
        resolveCanonicalResidentId(residentId);
    }

    record ResidentSnapshot(Long id, String healthRecordNo, String fullName, String gender,
                            java.time.LocalDate birthDate, String phone, boolean deceased) {}
}
