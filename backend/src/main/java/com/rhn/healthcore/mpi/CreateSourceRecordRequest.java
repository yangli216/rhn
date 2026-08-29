package com.rhn.healthcore.mpi;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record CreateSourceRecordRequest(
        @NotNull Long sourceOrganizationId,
        @NotBlank @Size(max = 100) String sourceSystem,
        @NotBlank @Size(max = 200) String sourceRecordId,
        @NotBlank @Size(max = 100) String fullName,
        @NotBlank @Pattern(regexp = "MALE|FEMALE|UNKNOWN") String gender,
        @NotNull @PastOrPresent LocalDate birthDate,
        @Size(max = 32) String phone,
        List<@Valid ResidentIdentifierInput> identifiers
) {
}
