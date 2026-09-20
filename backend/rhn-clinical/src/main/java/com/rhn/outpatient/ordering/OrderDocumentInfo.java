package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

/** Doctor-confirmed document metadata, independent from order-entry drafts. */
record OrderDocumentInfo(
        @NotNull @Size(max = 30) List<@NotNull @Valid DiagnosisLink> diagnoses,
        boolean externalPrescription,
        @Size(max = 120) String specialDisease,
        @Size(max = 2000) String examinationPurpose) {
    record DiagnosisLink(@NotBlank @Size(max = 100) String code,
                         @NotBlank @Size(max = 300) String display, boolean primary) {}
    static OrderDocumentInfo empty() { return new OrderDocumentInfo(List.of(), false, null, null); }
}
