package com.rhn.healthcore.allergy;

import java.time.Instant;

record AllergyResponse(
        Long id, long revision, Long residentId, Long encounterId, String assertionType, String categoryCode,
        String clinicalStatus, String verificationStatus, String criticalityCode, String reactionSeverity,
        String informationSource, String substanceCodeSystemUri, String substanceCode, String substanceDisplay,
        String reactionText, Instant onsetAt, Instant recordedAt, Long recorderPractitionerId,
        Instant verifiedAt, Long verifierPractitionerId, Instant inactivatedAt, String inactivationReason) {}
