package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

record OrderDraftSaveRequest(
        @NotBlank @Size(max = 128) String commandCode,
        @NotNull List<@NotNull @Valid BatchOrderMedicationItem> medicationItems,
        @NotNull List<@NotNull @Valid CreateServiceRequest> serviceItems) {}
