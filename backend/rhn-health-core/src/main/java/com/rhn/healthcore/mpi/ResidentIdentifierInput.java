package com.rhn.healthcore.mpi;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResidentIdentifierInput(
        @NotBlank @Size(max = 100) String system,
        @NotBlank @Size(max = 200) String value,
        @Pattern(regexp = "OFFICIAL|SECONDARY|TEMP") String useType) {
}
