package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

record CreateMedicationRequest(
        Long prescriptionId,
        Long medicationId,
        Long catalogItemId,
        Long packageId,
        @DecimalMin(value = "0", inclusive = false) BigDecimal doseValue,
        @Size(max = 64) String doseUnit,
        @Size(max = 64) String routeCode,
        @Size(max = 64) String frequencyCode,
        @DecimalMin(value = "0", inclusive = false) BigDecimal durationValue,
        @Size(max = 32) String durationUnit,
        @NotNull @DecimalMin(value = "0", inclusive = false) BigDecimal quantity,
        @Size(max = 64) String quantityUnit,
        boolean substitutionAllowed,
        boolean selfProvided,
        @Size(max = 1000) String medicationInstruction,
        @Size(max = 32) String priceType,
        Boolean pricingRequired,
        LocalDate businessDate,
        Long performerOrganizationId,
        Long performerDepartmentId,
        @Size(max = 1000) String reason) {}
