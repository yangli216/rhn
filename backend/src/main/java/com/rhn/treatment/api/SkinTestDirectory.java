package com.rhn.treatment.api;

import java.time.Instant;
import java.util.Collection;
import java.util.Map;

/** Read-only skin-test facts used by medication execution gates. */
public interface SkinTestDirectory {
    Map<Long, SkinTestSnapshot> latestForMedicationRequests(Long tenantId, Collection<Long> medicationRequestIds);

    record SkinTestSnapshot(Long eventId, long revision, Long medicationRequestId, String status,
                            String result, Instant startedAt, Instant completedAt) {
        public boolean passed() { return "NEGATIVE".equals(result); }
        public boolean positive() { return "POSITIVE".equals(result); }
    }
}
