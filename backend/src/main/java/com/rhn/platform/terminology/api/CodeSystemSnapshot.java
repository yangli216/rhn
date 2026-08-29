package com.rhn.platform.terminology.api;

import java.time.LocalDate;

/** Read-only code-system release data exposed without leaking terminology persistence entities. */
public record CodeSystemSnapshot(
        Long id, String scopeType, Long scopeId, String code, String name, String canonicalUri,
        String versionCode, String systemType, String publisher, String authorityType,
        String sourceUri, String contentHash, String status, LocalDate effectiveFrom, LocalDate effectiveTo
) {
    public boolean isEffectiveAt(LocalDate date) {
        return !effectiveFrom.isAfter(date) && (effectiveTo == null || !effectiveTo.isBefore(date));
    }
}
