package com.rhn.diagnostics.api;

import java.time.Instant;

public record CriticalValueAlertView(
        Long id, long revision, Long reportId, Long observationId, Long residentId, Long encounterId,
        Long requestId, Long organizationId, Long departmentId, Long recipientUserId,
        String severity, String observationCode, String observationName, String triggerEvidence,
        String status, Instant detectedAt, Instant acknowledgeDeadlineAt,
        Long acknowledgedBy, Instant acknowledgedAt, String acknowledgeNote,
        Long closedBy, Instant closedAt, String dispositionCode, String closeNote,
        Long supersededByReportId, int escalationLevel) {}
