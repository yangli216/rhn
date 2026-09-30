package com.rhn.billing.domain;

public enum RegistrationBillingIntentStatus {
    PAYMENT_PENDING,
    PAID,
    COMPLETING,
    COMPLETION_FAILED,
    COMPLETED,
    CANCELLED,
    CANCELLATION_PENDING,
    CANCELLATION_FAILED
}
