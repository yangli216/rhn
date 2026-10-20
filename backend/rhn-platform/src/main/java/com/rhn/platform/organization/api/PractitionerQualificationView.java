package com.rhn.platform.organization.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.time.Instant;

/**
 * A practitioner's registered qualification. {@code registered=false} means nothing has been recorded yet;
 * it must not be read as "has no prescribing right" by consumers that still need to support legacy staff.
 * {@code revision} is null until the first save.
 */
public record PractitionerQualificationView(
        Long practitionerId, boolean registered, Long revision,
        @DictionaryBinding("PRACT_PROF_TITLE") String sdProfessionalTitle,
        @DictionaryBinding("PRACT_CATEGORY") String sdPracticeCategory,
        String practiceCertificateCode, String qualificationCertificateCode, String insurancePractitionerCode,
        boolean prescribing, boolean narcoticPrescribing,
        @DictionaryBinding("BD_ANTIMICROBIAL_LEVEL") String sdAntimicrobialLevel,
        Instant updatedAt
) {
    public static PractitionerQualificationView unregistered(Long practitionerId) {
        return new PractitionerQualificationView(practitionerId, false, null, null, null, null, null, null,
                false, false, null, null);
    }
}
