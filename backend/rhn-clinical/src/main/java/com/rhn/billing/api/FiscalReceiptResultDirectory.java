package com.rhn.billing.api;

import com.rhn.billing.api.FiscalReceiptAdapter.ReceiptResult;
import com.rhn.billing.api.ReceiptViews.ReceiptView;

import java.time.Instant;

/**
 * Inbound fiscal boundary. A fiscal-platform adapter may call this only after it has authenticated
 * the sender and verified the protocol signature; raw public callbacks do not enter the domain here.
 */
public interface FiscalReceiptResultDirectory {
    ReceiptView accept(VerifiedReceiptResult result);

    record VerifiedReceiptResult(
            String fiscalAuthorityCode, String externalMessageBusinessId, String commandCode,
            String receiptRequestNo, Operation operation, ReceiptResult.Outcome outcome, String externalReceiptNo,
            String fiscalCode, String fiscalNumber, String verificationCode,
            String controlledObjectReference, Instant issuedAt, String actionReason, String errorCode,
            String errorMessage, Object sanitizedPayload) {
        public enum Operation { ISSUE, VOID, RED_FLUSH }
    }
}
