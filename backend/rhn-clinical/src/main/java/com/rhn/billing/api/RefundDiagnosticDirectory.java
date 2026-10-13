package com.rhn.billing.api;

/** Consumer-owned refund port, implemented by the diagnostics adapter. */
public interface RefundDiagnosticDirectory {
    boolean hasReportForRequest(Long tenantId, Long serviceRequestId);
    boolean hasExecutionForRequest(Long tenantId, Long serviceRequestId);
    void requireUnexecutedForRefund(Long tenantId, java.util.Collection<Long> serviceRequestIds);
}
