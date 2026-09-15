package com.rhn.quality.medication.domain;

import java.time.Instant;

/** Storage foundation only; accepting clinical overrides belongs to QMED-3's verified submit workflow. */
public record MedicationSafetyOverride(Long id, Long tenantId, Long evaluationId, Long findingId,
        Long actorId, String reason, Instant createdAt) {
    public MedicationSafetyOverride {
        if (reason == null || reason.isBlank() || reason.length() > 1000) {
            throw new IllegalArgumentException("Override reason must contain 1 to 1000 characters");
        }
        reason = reason.trim();
    }
}
