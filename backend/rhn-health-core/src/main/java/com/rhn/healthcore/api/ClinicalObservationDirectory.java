package com.rhn.healthcore.api;

import java.time.Instant;

/** Public health-record contract for structured observations produced by clinical workflows. */
public interface ClinicalObservationDirectory {
    BloodPressureEvidence recordBloodPressure(BloodPressureCommand command);

    record BloodPressureCommand(
            Long tenantId,
            Long residentId,
            Long encounterId,
            Integer systolic,
            Integer diastolic,
            Instant effectiveAt,
            Long performerPractitionerId,
            String performerName
    ) {
    }

    record BloodPressureEvidence(
            Long systolicObservationId,
            Long diastolicObservationId,
            Integer systolic,
            Integer diastolic,
            String unitCode,
            Instant effectiveAt
    ) {
    }
}
