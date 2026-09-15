package com.rhn.healthcore.api;

import java.time.Instant;

/** Public contract for longitudinal patient conditions. */
public interface ConditionDirectory {
    ConditionSnapshot ensureSuspected(RecordSuspectedCondition command);
    ConditionSnapshot require(Long tenantId, Long conditionId);

    record RecordSuspectedCondition(
            Long tenantId,
            Long residentId,
            Long termId,
            String conditionKey,
            String codeSystemUri,
            String codeRelease,
            String conditionCode,
            String conditionName,
            Instant onsetAt,
            Instant recordedAt,
            Long recorderPractitionerId,
            Long recorderUserId
    ) {
    }

    record ConditionSnapshot(
            Long id,
            long revision,
            Long residentId,
            Long termId,
            String conditionCode,
            String conditionName,
            String clinicalStatus,
            String verificationStatus,
            Instant recordedAt
    ) {
        public boolean confirmed() {
            return "CONFIRMED".equals(verificationStatus);
        }
    }
}
