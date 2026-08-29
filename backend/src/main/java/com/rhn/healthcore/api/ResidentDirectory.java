package com.rhn.healthcore.api;


/** Public contract exposed by the health-core module to other business modules. */
public interface ResidentDirectory {
    Long resolveCanonicalResidentId(Long residentId);

    ResidentSnapshot requireSnapshot(Long residentId);

    /**
     * Returns the canonical resident while holding a write lock for the current transaction.
     * Cross-module workflows use this to serialize creation of resident-scoped authoritative facts.
     */
    ResidentSnapshot requireSnapshotForUpdate(Long residentId);

    default void requireResident(Long residentId) {
        resolveCanonicalResidentId(residentId);
    }

    record ResidentSnapshot(Long id, String healthRecordNo, String fullName, String gender,
                            java.time.LocalDate birthDate, String phone, boolean deceased) {}
}
