package com.rhn.platform.realtime.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TerminatePresenceRequest(@NotBlank @Size(min = 2, max = 200) String reason) {}
