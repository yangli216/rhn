package com.rhn.platform.printing.api;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * Printing platform contract for querying registration billing snapshots across module boundaries.
 */
public interface RegistrationBillingDirectory {

    Optional<RegistrationPaymentSnapshot> findPaymentSnapshotByEncounterId(Long tenantId, Long encounterId);

    record RegistrationPaymentSnapshot(
            BigDecimal totalFee,
            BigDecimal payableAmount,
            BigDecimal insuranceDeduction,
            BigDecimal discountAmount,
            String paymentMethodCode,
            String paymentMethodName
    ) {}
}
