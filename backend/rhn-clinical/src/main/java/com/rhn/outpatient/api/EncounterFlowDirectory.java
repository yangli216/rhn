package com.rhn.outpatient.api;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/** Read-only encounter facts used to coordinate the patient's outpatient journey. */
public interface EncounterFlowDirectory {
    /** All scoped encounters in the half-open date range; no implicit result cap. */
    List<EncounterFlowSnapshot> findInRange(Long tenantId, Long organizationId, Long departmentId,
                                           Instant fromInclusive, Instant toExclusive);

    List<EncounterFlowSnapshot> findByIds(Long tenantId, Collection<Long> encounterIds);

    record EncounterFlowSnapshot(
            Long encounterId, Long residentId, String encounterNo,
            Long organizationId, Long departmentId, String clinicianId, String clinicalStatus,
            Instant registeredAt, Instant startedAt, Instant completedAt,
            String terminationCode, String terminationReason, Instant terminatedAt) {}
}
