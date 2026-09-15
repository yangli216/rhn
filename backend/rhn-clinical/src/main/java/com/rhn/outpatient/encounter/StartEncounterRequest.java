package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;

import java.util.Map;

public record StartEncounterRequest(
        @Size(max = 128) String commandCode,
        @NotEmpty Map<String, Boolean> factorResults,
        @Size(max = 128) String terminalCode
) {
}
