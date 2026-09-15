package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;


public record RegisterEncounterRequest(
        @NotNull(message = "居民不能为空") Long residentId,
        @NotNull(message = "机构不能为空") Long organizationId,
        @NotNull(message = "科室不能为空") Long departmentId,
        Long appointmentId,
        Long scheduleId,
        Long slotHoldId,
        @Size(max = 128) String idempotencyCode,
        @Pattern(regexp = "WINDOW|WALK_IN|DIRECT|EMERGENCY") String registrationSource,
        @Pattern(regexp = "GENERAL|FOLLOW_UP|EMERGENCY") String visitType
) {
}
