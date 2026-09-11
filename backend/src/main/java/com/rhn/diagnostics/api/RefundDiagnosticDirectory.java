package com.rhn.diagnostics.api;

/** Public diagnostics boundary used by refund coordination. */
public interface RefundDiagnosticDirectory {
    boolean hasReportForRequest(Long tenantId, Long serviceRequestId);
}
