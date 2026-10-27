package com.rhn.billing.api;

import com.rhn.platform.dictionary.api.DictionaryBinding;

import java.math.BigDecimal;
import java.time.Instant;

public final class RegistrationBillingViews {
    private RegistrationBillingViews() {}

    public record RegistrationIntentView(
            Long id, long revision, Long residentId, Long organizationId, Long departmentId,
            Long appointmentId, Long scheduleId, Long catalogItemId, Long slotHoldId, Long patientAccountId,
            Long settlementId, Long paymentOrderId, Long encounterId, String idempotencyCode,
            @DictionaryBinding("SC_REGISTRATION_SOURCE") String registrationSource,
            @DictionaryBinding("SC_VISIT_TYPE") String visitType, @DictionaryBinding("BIL_SETTLEMENT_MODE") String settlementMode, Long coverageId,
            String coverageTypeCode, String coveragePayerName, String status, BigDecimal feeAmount,
            String currencyCode, String itemCode, String itemName, Instant expiresAt,
            int completionAttempts, String lastErrorCode, String lastErrorMessage,
            Instant createdAt, Instant updatedAt, Instant completedAt, boolean duplicate,
            String insuranceTiming) {}
}
