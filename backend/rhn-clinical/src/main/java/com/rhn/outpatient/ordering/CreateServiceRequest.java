package com.rhn.outpatient.ordering;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

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
        @Size(max = 2000) String clinicalDescription,
        /** 检查部位编码（检查部位方式编码），按选择顺序；按部位计价的检查数量由服务端按部位数换算。 */
        @Size(max = 30) List<@jakarta.validation.constraints.NotBlank @Size(max = 128) String> bodySiteCodes) {

    List<String> sites() {
        return bodySiteCodes == null ? List.of() : bodySiteCodes;
    }
}
