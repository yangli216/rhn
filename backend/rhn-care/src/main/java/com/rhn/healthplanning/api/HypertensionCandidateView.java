package com.rhn.healthplanning.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record HypertensionCandidateView(
        Long taskId,
        long revision,
        String taskCode,
        String status,
        String priority,
        Long residentId,
        String residentName,
        Long encounterId,
        Long conditionId,
        String conditionCode,
        String conditionName,
        String verificationStatus,
        Long organizationId,
        Long departmentId,
        Instant dueAt,
        String title,
        String description,
        Instant createdAt,
        List<EvidenceEventView> evidenceEvents
) {
    public record EvidenceEventView(
            Long id,
            String eventType,
            String commandCode,
            String resultDescription,
            String ruleCode,
            String ruleVersion,
            Map<String, Object> evidence,
            String evidenceHash,
            Instant occurredAt
    ) {
    }
}
