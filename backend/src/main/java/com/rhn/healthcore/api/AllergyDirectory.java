package com.rhn.healthcore.api;

import java.util.List;

/** Patient allergy facts exposed to prescribing and other clinical modules. */
public interface AllergyDirectory {
    List<AllergySnapshot> activeForResident(Long residentId);

    record AllergySnapshot(Long id, String assertionType, String categoryCode, String criticalityCode,
                           String reactionSeverity, String substanceCodeSystemUri, String substanceCode,
                           String substanceDisplay, String reactionText) {
        public boolean isDrugAllergy() {
            return "ALLERGY".equals(assertionType) && "DRUG".equals(categoryCode);
        }
    }
}
