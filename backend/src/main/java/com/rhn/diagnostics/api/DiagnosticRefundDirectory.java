package com.rhn.diagnostics.api;

/** Narrow diagnostic boundary used by cross-domain refund coordination. */
public interface DiagnosticRefundDirectory {
    RefundExecutionSnapshot refundExecution(Long tenantId, Long serviceRequestId);

    record RefundExecutionSnapshot(boolean reportIssued) {
        public static RefundExecutionSnapshot unexecuted() {
            return new RefundExecutionSnapshot(false);
        }
    }
}
