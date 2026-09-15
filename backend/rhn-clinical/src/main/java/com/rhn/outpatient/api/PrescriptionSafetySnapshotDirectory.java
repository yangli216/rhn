package com.rhn.outpatient.api;

/** Clinical owns authorization and snapshot assembly; Quality must not read clinical repositories. */
public interface PrescriptionSafetySnapshotDirectory {
    PrescriptionSafetySnapshot requireSnapshot(Long encounterId, Long prescriptionId);
}
