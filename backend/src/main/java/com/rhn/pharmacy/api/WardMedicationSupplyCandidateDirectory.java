package com.rhn.pharmacy.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Consumer-owned port used by pharmacy to obtain already planned inpatient medication occurrences.
 * The inpatient module implements this contract; pharmacy never reaches into inpatient persistence.
 */
public interface WardMedicationSupplyCandidateDirectory {
    default List<SupplyCandidate> eligibleOccurrences(Long tenantId, Long organizationId,
                                                      Long nursingUnitDepartmentId,
                                                      Instant windowFrom, Instant windowTo) {
        return eligibleOccurrences(tenantId, organizationId, nursingUnitDepartmentId,
                null, windowFrom, windowTo);
    }

    List<SupplyCandidate> eligibleOccurrences(Long tenantId, Long organizationId,
                                              Long nursingUnitDepartmentId,
                                              String medicationTypeSnapshot,
                                              Instant windowFrom, Instant windowTo);

    /**
     * Discovers real medication-demand scopes directly from planned inpatient occurrences.
     * The returned earliest occurrence lets a system scheduler bound its follow-up shift query
     * without treating pharmacy routes as the source of demand.
     */
    List<SupplyScope> discoverEligibleScopes(Instant windowFrom, Instant windowTo);

    record SupplyScope(
            Long tenantId, Long organizationId, Long nursingUnitDepartmentId,
            String medicationTypeSnapshot, Instant earliestScheduledAt) {
    }

    record SupplyCandidate(
            Long orderTaskId, Long requestId, Long episodeId, Long encounterId, Long residentId,
            String residentName, Long organizationId, Long nursingUnitDepartmentId,
            String bedNo, Instant scheduledAt,
            BigDecimal requiredQuantity, String quantityUnit,
            BigDecimal requiredBaseQuantity, String baseUnitCode,
            Long medicationId, String medicationCode, String medicationName,
            String medicationTypeSnapshot) {
    }
}
