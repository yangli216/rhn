package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class StandardMappingViews {
    private StandardMappingViews() {}

    public record StandardCodeSystemView(
            Long id, String code, String name, String version, String systemType, String authorityType,
            String publisher, String status, LocalDate effectiveFrom, LocalDate effectiveTo,
            String canonicalUri, String sourceUri, String contentHash) {}

    public record StandardTermView(
            Long id, Long codeSystemId, String systemCode, String systemName, String systemVersion,
            String authorityType, String code, String display, String shortDisplay, String conceptType,
            String status, LocalDate effectiveFrom, LocalDate effectiveTo) {}

    public record ItemTermMappingView(
            Long id, long revision, Long subjectId, String subjectType, Long targetId,
            Long conceptId, Long codeSystemId, String systemCode, String systemName, String systemVersion,
            String authorityType, String termCode, String termDisplay, String mappingType,
            String equivalence, boolean primaryMapping, String limitation,
            LocalDate validFrom, LocalDate validTo, String status, Long replacesMappingId,
            Instant createdAt, Long createdBy, Instant updatedAt, Long updatedBy) {}

    public record ItemTermMappingMaintenanceView(
            Long subjectId, String subjectType, Long targetId, LocalDate businessDate,
            List<ItemTermMappingView> effectiveMappings, List<ItemTermMappingView> history) {}
}
