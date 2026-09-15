package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.Size;

public record ResumeEncounterRequest(
        @Size(max = 128) String commandCode,
        @Size(max = 128) String terminalCode
) {}
