package com.rhn.healthcore.allergy;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;

record RecordAllergyRequest(
        Long encounterId,
        @NotBlank @Size(max = 32) String assertionType,
        @Size(max = 32) String categoryCode,
        @Size(max = 32) String criticalityCode,
        @Size(max = 32) String reactionSeverity,
        @NotBlank @Size(max = 32) String informationSource,
        @Size(max = 300) String substanceCodeSystemUri,
        @Size(max = 128) String substanceCode,
        @Size(max = 300) String substanceDisplay,
        @Size(max = 1000) String reactionText,
        Instant onsetAt) {}
