package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Stable, read-only pharmacy facts consumed by billing.
 */
public interface DispenseBillingDirectory {
    DispenseBillingFact requireById(Long tenantId, Long dispenseId);

    List<DispenseBillingFact> findByEncounter(Long tenantId, Long encounterId);

    List<DispenseBillingFact> findWorklist(Long tenantId, Long organizationId);

    List<DispenseBillingFact> findOccurredBetween(
            Long tenantId, Long organizationId, Instant from, Instant to);

    record DispenseBillingFact(
            Long id,
            Long residentId,
            Long encounterId,
            Long stockSiteId,
            Long siteOrganizationId,
            Long originalDispenseId,
            String dispenseNo,
            String dispenseType,
            Instant occurredAt,
            BigDecimal operationQuantity,
            String operationUnitCode,
            Long requestId,
            Long catalogItemId,
            Long packageId,
            BigDecimal baseQuantityFactor,
            String productCodeSnapshot,
            String productNameSnapshot) {}
}
