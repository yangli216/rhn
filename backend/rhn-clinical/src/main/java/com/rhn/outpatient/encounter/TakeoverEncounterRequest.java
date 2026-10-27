package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TakeoverEncounterRequest(
        @Size(max = 128) String commandCode,
        @NotBlank(message = "接管原因不能为空") @Size(max = 500) String reason,
        @Size(max = 128) String terminalCode
) {}
