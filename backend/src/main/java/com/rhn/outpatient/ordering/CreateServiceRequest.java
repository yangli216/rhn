package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

record CreateServiceRequest(
        @NotNull Long catalogItemId,
        Long packageId,
        @NotNull @DecimalMin(value = "0.001") BigDecimal quantity,
        @Size(max = 64) String unitCode,
        @Size(max = 32) String priceType,
        Boolean pricingRequired,
        LocalDate businessDate,
        Long performerOrganizationId,
        Long performerDepartmentId,
        @Size(max = 1000) String reason,
        @Size(max = 2000) String clinicalDescription) {
}
