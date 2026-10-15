package com.rhn.outpatient.encounter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelEncounterCompletionRequest(
        @Size(max = 128) String commandCode,
        @Size(max = 128) String terminalCode,
        @NotBlank(message = "取消诊毕原因不能为空") @Size(max = 500) String reason
) {}
