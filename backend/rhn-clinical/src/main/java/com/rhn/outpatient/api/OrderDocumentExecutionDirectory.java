package com.rhn.outpatient.api;

public interface OrderDocumentExecutionDirectory {
    boolean isAmendable(Long tenantId, Long requestId);
    void requireAmendable(Long tenantId, Long requestId);
}
