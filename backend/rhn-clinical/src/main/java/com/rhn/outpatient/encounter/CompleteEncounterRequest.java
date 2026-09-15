package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CompleteEncounterRequest(
        @Size(max = 128) String commandCode,
        @Pattern(regexp = "HOME|FOLLOW_UP|OBSERVATION|REFERRAL|ADMISSION") String dispositionCode,
        @Size(max = 800) String dispositionNote
) {
    static CompleteEncounterRequest defaultRequest() {
        return new CompleteEncounterRequest(null, "HOME", null);
    }
}
