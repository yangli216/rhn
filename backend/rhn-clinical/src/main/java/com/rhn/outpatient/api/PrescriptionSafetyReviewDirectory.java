package com.rhn.outpatient.api;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/** Submission-time clinical context shown alongside the existing pharmacist review workflow. */
public interface PrescriptionSafetyReviewDirectory {
    Review forMedicationRequest(Long requestId);

    /**
     * 批量读取审方快照，返回 Map 包含所有已找到的请求（无快照时值为 {@code null}）。
     * 默认返回空 Map，调用方按单条 {@link #forMedicationRequest(Long)} 回退。
     */
    default Map<Long, Review> forMedicationRequests(Collection<Long> requestIds) {
        return Map.of();
    }

    record Medication(Long requestId, String name) {}
    record Review(Long prescriptionId, String prescriptionNo, Instant submittedAt,
                  String doctorReason, MedicationSafetyDecision evaluation, List<Medication> medications) {}
}
