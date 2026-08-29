package com.rhn.platform.terminology.api;

/** Immutable terminology identity and display snapshot for clinical facts. */
public record TerminologyConceptSnapshot(
        Long id,
        String systemCode,
        String systemUri,
        String systemVersion,
        String code,
        String display
) {
}
