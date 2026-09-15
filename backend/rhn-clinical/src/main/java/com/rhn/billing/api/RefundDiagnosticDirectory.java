package com.rhn.billing.api;

/** Consumer-owned refund port, implemented by the diagnostics adapter. */
public interface RefundDiagnosticDirectory {
    boolean hasReportForRequest(Long tenantId, Long serviceRequestId);
}
