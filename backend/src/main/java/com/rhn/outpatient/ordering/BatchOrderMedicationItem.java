package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record BatchOrderMedicationItem(
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
        Boolean allergyReviewConfirmed,
        @Size(max = 1000) String allergyOverrideReason,
        @Size(max = 32) String priceType,
        Boolean pricingRequired,
        Long stockSiteId,
        @Size(max = 128) String stockSiteName,
        @Size(max = 128) String administrationGroupKey,
        @Size(max = 32) String routeExecutionType,
        @Size(max = 32) String categoryCode,
        @Size(max = 1000) String reason
) {}
