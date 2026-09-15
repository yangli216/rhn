package com.rhn.healthcore.api;

import java.util.List;
import java.time.Instant;

/** Patient allergy facts exposed to prescribing and other clinical modules. */
public interface AllergyDirectory {
    List<AllergySnapshot> activeForResident(Long residentId);

    /** Records a confirmed drug allergy after a positive skin test and supersedes negative assertions. */
    AllergySnapshot recordPositiveDrugSkinTest(Long residentId, Long encounterId, String substanceCode,
                                               String substanceDisplay, String reactionText,
                                               Instant onsetAt, Long skinTestEventId);

    record AllergySnapshot(Long id, Long allergenId, String assertionType, String categoryCode, String criticalityCode,
                           String reactionSeverity, String substanceCodeSystemUri, String substanceCode,
                           String substanceDisplay, String reactionText) {
        public boolean isDrugAllergy() {
            return "ALLERGY".equals(assertionType) && "DRUG".equals(categoryCode);
        }
    }
}
