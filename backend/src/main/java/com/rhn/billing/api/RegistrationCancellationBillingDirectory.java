package com.rhn.billing.api;

/**
 * Registration-specific financial reversal boundary used before an unserved
 * outpatient registration is closed.
 */
public interface RegistrationCancellationBillingDirectory {
    CancellationBillingResult cancelBeforeService(Long encounterId, String commandCode,
                                                   String reason, String terminalCode);

    record CancellationBillingResult(String billingStatus, Long refundOrderId, String refundStatus,
                                     boolean readyToClose, String message) {
    }
}
