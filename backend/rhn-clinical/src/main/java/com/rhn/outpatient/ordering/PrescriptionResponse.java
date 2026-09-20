package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import java.time.Instant;
import java.util.List;

record PrescriptionResponse(
        Long id, long revision, Long residentId, Long encounterId, String prescriptionNo,
        String categoryCode, String status, Long performerOrganizationId, Long performerDepartmentId,
        Instant authoredAt, Long authoredBy, Instant submittedAt, Long submittedBy,
        Instant cancelledAt, Long cancelledBy, String cancelReason, String note,
        List<MedicationRequestResponse> medicationRequests,
        MedicationSafetyDecision safetyEvaluation, OrderDocumentInfo documentInfo) {}
