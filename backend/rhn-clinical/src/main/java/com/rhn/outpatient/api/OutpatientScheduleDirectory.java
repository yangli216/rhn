package com.rhn.outpatient.api;

import java.time.Instant;

/** Public scheduling boundary used by registration charging without exposing scheduling entities. */
public interface OutpatientScheduleDirectory {
    SlotHoldSnapshot reserve(SlotHoldCommand command);

    SlotHoldSnapshot require(Long holdId);

    SlotHoldSnapshot consume(Long holdId, Long residentId, Long scheduleId, String commandCode);

    void bindRegistration(Long holdId, Long registrationId);

    void release(Long holdId, String commandCode, boolean expired);

    record SlotHoldCommand(Long residentId, Long organizationId, Long departmentId, Long scheduleId,
                           String idempotencyCode, Instant expiresAt) {}

    record SlotHoldSnapshot(Long id, Long poolId, Long scheduleId, Long residentId, Long catalogItemId,
                            String serviceCode, String serviceName, String status, Instant expiresAt) {}
}
