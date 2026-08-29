package com.rhn.platform.terminology.api;

import java.time.LocalDate;

/** Read-only terminology concept data for platform consumers such as standard mappings. */
public record ConceptSnapshot(
        Long id, Long codeSystemId, String code, String display, String shortDisplay,
        String conceptType, String searchCode, String status, LocalDate effectiveFrom, LocalDate effectiveTo
) {
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }
}
