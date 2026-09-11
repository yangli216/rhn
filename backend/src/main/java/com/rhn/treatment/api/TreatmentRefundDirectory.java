package com.rhn.treatment.api;

/** Narrow treatment boundary used by cross-domain refund coordination. */
public interface TreatmentRefundDirectory {
    RefundExecutionSnapshot refundExecution(Long tenantId, Long treatmentSourceId);

    record RefundExecutionSnapshot(String status) {
        public static RefundExecutionSnapshot unexecuted() {
            return new RefundExecutionSnapshot("UNEXECUTED");
        }

        public boolean executed() {
            return "COMPLETED".equals(status) || "IN_PROGRESS".equals(status);
        }
    }
}
