package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * Stable, read-only pharmacy facts consumed by billing.
 */
public interface DispenseBillingDirectory {
    DispenseBillingFact requireById(Long tenantId, Long dispenseId);

    List<DispenseBillingFact> findByEncounter(Long tenantId, Long encounterId);

    /** 按就诊批量装载发退药事实；用于工作列表按已加载账户的就诊范围收窄，避免全机构历史扫描。 */
    List<DispenseBillingFact> findByEncounters(Long tenantId, Long organizationId, Collection<Long> encounterIds);

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
            String productNameSnapshot,
            Long taskId,
            Long processedBy) {}
}
