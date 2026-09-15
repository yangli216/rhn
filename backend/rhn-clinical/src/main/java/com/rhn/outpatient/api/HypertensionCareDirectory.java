package com.rhn.outpatient.api;

import java.time.Instant;

/** Clinical-owned screening port; the care adapter evaluates structured blood-pressure evidence. */
public interface HypertensionCareDirectory {
    ScreeningOutcome evaluateBloodPressure(ScreeningCommand command);

    record ScreeningCommand(
            Long tenantId,
            Long residentId,
            Long encounterId,
            Long organizationId,
            Long departmentId,
            Long systolicObservationId,
            Long diastolicObservationId,
            Integer systolic,
            Integer diastolic,
            String unitCode,
            Instant measuredAt
    ) {
    }

    record ScreeningOutcome(
            String decision,
            Long conditionId,
            Long careTaskId,
            String taskCode,
            String ruleCode,
            String ruleVersion
    ) {
        public static ScreeningOutcome notApplicable(String decision, String ruleCode, String ruleVersion) {
            return new ScreeningOutcome(decision, null, null, null, ruleCode, ruleVersion);
        }
    }
}
