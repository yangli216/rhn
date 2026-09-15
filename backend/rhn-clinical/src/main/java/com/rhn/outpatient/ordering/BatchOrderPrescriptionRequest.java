package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record BatchOrderPrescriptionRequest(
        @NotEmpty List<@Valid BatchOrderMedicationItem> items,
        boolean autoSubmit
) {}
