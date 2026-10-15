package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;


public record RegisterEncounterRequest(
        @NotNull(message = "居民不能为空") Long residentId,
        @NotNull(message = "机构不能为空") Long organizationId,
        @NotNull(message = "科室不能为空") Long departmentId,
        Long appointmentId,
        Long scheduleId,
        Long slotHoldId,
        @Size(max = 128) String idempotencyCode,
        // Values are SC_REGISTRATION_SOURCE / SC_VISIT_TYPE items, validated by registration; TRANSFER is internal.
        @Size(max = 32) String registrationSource,
        @Size(max = 32) String visitType
) {
}
