package com.rhn.billing.api;

/** Runs the business-side completion only after the financial payment fact is durable. */
public interface BillingSceneCompletionHandler {
    boolean supports(String businessScene);

    default void paymentRequested(PaymentRequested requested) {}

    void complete(PaymentCompletion completion);

    record PaymentRequested(Long paymentOrderId, Long settlementId, Long patientAccountId,
                            String businessScene, String commandCode) {}

    record PaymentCompletion(Long paymentOrderId, Long settlementId, Long patientAccountId,
                             String businessScene, String commandCode) {}
}
