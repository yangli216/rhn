package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

record UpdateOrderDocumentInfo(@NotNull @PositiveOrZero Long expectedRevision,
                              @NotNull @Valid OrderDocumentInfo documentInfo) {}
