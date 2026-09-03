package com.rhn.outpatient.ordering;

import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

record MedicationRequestResponse(
        Long id, long revision, Long residentId, Long encounterId, String requestNo, String status,
        Long prescriptionId, Long parentRequestId, Long catalogItemId, Long medicationId, Long packageId,
        Long performerOrganizationId, Long performerDepartmentId, LocalDate businessDate,
        Instant authoredAt, Long authoredBy, String reason,
        String itemCode, String itemName, String localCode, String localName,
        Long adoptionId, Long adoptionRevision,
        Long priceId, Long priceRevision, String priceType, BigDecimal unitPrice,
        BigDecimal priceQuantity, BigDecimal totalAmount, String currencyCode,
        String medicationCode, String medicationName, String medicationType, String doseForm,
        String preparationSpec, String preparationUnit, boolean skinTestRequired,
        boolean antimicrobial, String antimicrobialLevel,
        BigDecimal doseValue, String doseUnit, Long routeId, String routeCode, String routeName,
        String routeExecutionType, String frequencyCode,
        Long frequencyId, String frequencyName, JsonNode frequencyRule,
        BigDecimal durationValue, String durationUnit,
        BigDecimal quantity, String quantityUnit, BigDecimal baseQuantity, String baseUnit,
        BigDecimal packageFactor, String packageUnitName, String packageSpec,
        boolean substitutionAllowed, boolean selfProvided, String medicationInstruction,
        JsonNode medicationSnapshot, JsonNode itemAttributeSnapshot, String itemAttributeHash,
        Instant itemAttributeResolvedAt, JsonNode standardMappings,
        Instant cancelledAt, Long cancelledBy, String cancelReason) {}
