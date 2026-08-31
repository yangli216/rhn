package com.rhn.outpatient.api;

import java.time.Instant;

/** Stable command boundary for closing an encounter after clinical service has started. */
public interface OutpatientEncounterTerminationDirectory {
    TerminationSnapshot requireCandidate(Long encounterId);

    TerminationSnapshot terminate(TerminationCommand command);

    record TerminationCommand(Long encounterId, String commandCode, String terminationCode, String reason) {}

    record TerminationSnapshot(Long encounterId, Long tenantId, Long organizationId, Long departmentId,
                               Long residentId, String encounterNo, String status, String terminationCode,
                               String terminationReason, Instant terminatedAt) {}
}
