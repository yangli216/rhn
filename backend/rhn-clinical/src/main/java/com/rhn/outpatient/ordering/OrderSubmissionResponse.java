package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import java.util.List;

/** REVIEW_REQUIRED 时未写入任何单据，需医生确认 reviews 后携带 reviewKey 重新提交；READY 为预检无需确认。 */
record OrderSubmissionResponse(Status status, String reviewKey, List<MedicationSafetyDecision> reviews,
                               List<PrescriptionResponse> prescriptions, List<ServiceRequestResponse> services) {
    enum Status { SUBMITTED, REVIEW_REQUIRED, READY }
}
