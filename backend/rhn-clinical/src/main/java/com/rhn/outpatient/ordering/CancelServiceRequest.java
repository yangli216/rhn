package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record CancelServiceRequest(
        @NotNull Long expectedRevision,
        @NotBlank @Size(max = 1000) String reason) {
}
