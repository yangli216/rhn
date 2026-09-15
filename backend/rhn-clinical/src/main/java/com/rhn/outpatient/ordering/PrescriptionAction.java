package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record PrescriptionAction(
        @NotNull @Min(0) Long expectedRevision,
        @Size(max = 1000) String reason) {}
