package com.rhn.outpatient.api;

/**
 * Stable outpatient boundary for withdrawing a registration before clinical
 * service starts. Financial reversal is deliberately coordinated outside the
 * outpatient module.
 */
public interface OutpatientEncounterCancellationDirectory {
    CancellationSnapshot prepare(Long encounterId);

    CancellationSnapshot cancelBeforeService(Long encounterId, String commandCode, String reason);

    record CancellationSnapshot(Long encounterId, Long tenantId, Long organizationId, Long departmentId,
                                Long residentId, String encounterNo, String encounterStatus,
                                Long registrationId, String registrationStatus, String queueStatus,
                                String appointmentStatus) {
    }
}
