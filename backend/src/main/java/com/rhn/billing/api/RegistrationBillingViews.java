package com.rhn.billing.api;

import java.math.BigDecimal;
import java.time.Instant;

public final class RegistrationBillingViews {
    private RegistrationBillingViews() {}

    public record RegistrationIntentView(
            Long id, long revision, Long residentId, Long organizationId, Long departmentId,
            Long scheduleId, Long catalogItemId, Long slotHoldId, Long patientAccountId,
            Long settlementId, Long paymentOrderId, Long encounterId, String idempotencyCode,
            String registrationSource, String visitType, String status, BigDecimal feeAmount,
            String currencyCode, String itemCode, String itemName, Instant expiresAt,
            int completionAttempts, String lastErrorCode, String lastErrorMessage,
            Instant createdAt, Instant updatedAt, Instant completedAt, boolean duplicate) {}
}
