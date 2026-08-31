package com.rhn.diagnostics.api;

import java.time.Instant;

public record DiagnosticExecutionTaskView(
        Long id, long revision, String taskNo, String requestType, String status,
        Long residentId, String residentName, String healthRecordNo, Long encounterId, Long requestId,
        Long organizationId, Long departmentId, Long settlementId, Long reportId,
        String itemCode, String itemName, String specimenType, String examinationType,
        Instant createdAt, Instant collectedAt, String specimenNo, String collectionNote,
        Instant startedAt, Instant completedAt, String completionNote, String exceptionNote) {}

