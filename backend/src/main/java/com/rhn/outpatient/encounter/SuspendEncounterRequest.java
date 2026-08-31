package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SuspendEncounterRequest(
        @Size(max = 128) String commandCode,
        @NotBlank(message = "暂挂原因不能为空") @Size(max = 500) String reason
) {}
