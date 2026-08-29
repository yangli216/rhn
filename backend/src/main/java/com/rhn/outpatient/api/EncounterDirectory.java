package com.rhn.outpatient.api;

/** Public outpatient encounter contract used by sibling clinical request modules. */
public interface EncounterDirectory {
    EncounterSnapshot requireAccessible(Long encounterId);
    EncounterSnapshot requireActiveForOrdering(Long encounterId);

    record EncounterSnapshot(
            Long id, Long tenantId, Long residentId, Long organizationId, Long departmentId,
            String encounterNo, String clinicianId, String status) {}
}
