package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Published, immutable clinical rules. Execution owns patient-specific interpretation and evidence. */
public interface DiagnosticTemplateDirectory {
    Optional<TemplateView> current(Long tenantId, Long organizationId, Long catalogItemId, LocalDate date);
    TemplateView requireVersion(Long tenantId, Long organizationId, Long catalogItemId, Long versionId, LocalDate date);

    record TemplateContent(List<Indicator> indicators, List<Phrase> phrases, List<String> requiredChecks,
                           int minimumImages) {}
    record Indicator(String code, String name, String valueType, String unitCode, Integer precision,
                     boolean required, String methodCode, String specimenType, List<String> allowedCodes,
                     List<ReferenceRule> rules) {}
    /** Age ranges are [minimumAgeDays, maximumAgeDays); absent conditions are unrestricted. */
    record ReferenceRule(String code, String gender, Integer minimumAgeDays, Integer maximumAgeDays,
                         String instrumentCode, String populationCode, BigDecimal referenceLow,
                         BigDecimal referenceHigh, BigDecimal criticalLow, BigDecimal criticalHigh,
                         List<String> criticalCodes) {}
    record Phrase(String code, String title, String findings, String conclusion) {}
    record TemplateView(Long id, Long organizationId, Long catalogItemId, int version, String serviceType,
                        LocalDate effectiveFrom, String publicationBasis, Long publishedBy,
                        Instant publishedAt, TemplateContent content) {}
    record PublishCommand(int expectedVersion, LocalDate effectiveFrom, String publicationBasis,
                          TemplateContent content) {}
}
