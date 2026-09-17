package com.rhn.outpatient.api;

import java.util.Objects;

/** Only server-assembled complete prescription snapshots may be passed to this internal port. */
public record PrescriptionSafetyRequest(PrescriptionSafetySnapshot snapshot, String ruleSetVersion) {
    public PrescriptionSafetyRequest(PrescriptionSafetySnapshot snapshot) {
        this(snapshot, null);
    }

    public PrescriptionSafetyRequest {
        Objects.requireNonNull(snapshot, "snapshot");
    }
}
