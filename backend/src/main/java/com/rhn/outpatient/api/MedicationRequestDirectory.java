package com.rhn.outpatient.api;

import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Public, read-only medication-order contract consumed by pharmacy and billing modules. */
public interface MedicationRequestDirectory {
    MedicationRequestSnapshot requireForPharmacy(Long requestId);

    List<MedicationRequestSnapshot> activeForPharmacy(Long organizationId);

    record MedicationRequestSnapshot(
            Long id, long revision, Long tenantId, Long residentId, Long encounterId,
            Long prescriptionId, String requestNo, String status,
            Long catalogItemId, Long medicationId, Long packageId,
            Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
            Instant authoredAt, Long authoredBy,
            String itemCode, String itemName, String localCode, String localName,
            String medicationCode, String medicationName, String medicationType,
            BigDecimal quantity, String quantityUnit, BigDecimal baseQuantity, String baseUnit,
            BigDecimal packageFactor, boolean substitutionAllowed, boolean selfProvided,
            Long priceId, Long priceRevision, String priceType,
            BigDecimal unitPrice, BigDecimal priceQuantity, BigDecimal totalAmount, String currencyCode,
            JsonNode medicationSnapshot, JsonNode itemAttributeSnapshot, String itemAttributeHash,
            Instant itemAttributeResolvedAt, JsonNode standardMappings) {}
}
