package com.rhn.outpatient.ordering;

import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

record ServiceRequestResponse(
        Long id, long revision, Long residentId, Long encounterId, String requestNo, String status,
        Long catalogItemId, Long packageId, Long performerOrganizationId, Long performerDepartmentId,
        LocalDate businessDate, Instant authoredAt, Long authoredBy, String reason,
        String itemCode, String itemName, String unitCode, String localCode, String localName,
        Long adoptionId, long adoptionRevision, Long priceId, Long priceRevision, String priceType,
        BigDecimal quantity, BigDecimal unitPrice, BigDecimal totalAmount, String currencyCode,
        JsonNode itemAttributeSnapshot, String itemAttributeHash, Instant itemAttributeResolvedAt,
        JsonNode standardMappings, String serviceType, String specimenType, String examinationType,
        String clinicalDescription,
        Instant cancelledAt, Long cancelledBy, String cancelReason) {
}
